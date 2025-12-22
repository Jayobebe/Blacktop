import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Store active stream connections
const activeStreams = new Map<string, {
  broadcasterSocket: WebSocket | null;
  viewerSockets: Set<WebSocket>;
  rideStats: {
    speed: number;
    maxSpeed: number;
    distance: number;
    duration: number;
  };
}>();

serve(async (req) => {
  const { headers } = req;
  const upgradeHeader = headers.get("upgrade") || "";

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Handle non-WebSocket requests (stream info, health check)
  if (upgradeHeader.toLowerCase() !== "websocket") {
    const url = new URL(req.url);
    
    // Health check
    if (url.pathname.endsWith('/health')) {
      return new Response(JSON.stringify({ status: 'ok', activeStreams: activeStreams.size }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Get stream info
    const streamKey = url.searchParams.get('streamKey');
    if (streamKey) {
      const stream = activeStreams.get(streamKey);
      return new Response(JSON.stringify({
        active: !!stream?.broadcasterSocket,
        viewers: stream?.viewerSockets.size || 0,
        stats: stream?.rideStats || null,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    return new Response(JSON.stringify({ error: 'WebSocket connection required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Upgrade to WebSocket
  const { socket, response } = Deno.upgradeWebSocket(req);
  
  const url = new URL(req.url);
  const streamKey = url.searchParams.get('streamKey');
  const role = url.searchParams.get('role') || 'viewer'; // 'broadcaster' or 'viewer'
  
  if (!streamKey) {
    socket.close(1008, 'Stream key required');
    return response;
  }

  console.log(`[Stream Relay] New ${role} connection for stream: ${streamKey}`);

  socket.onopen = () => {
    // Initialize stream if it doesn't exist
    if (!activeStreams.has(streamKey)) {
      activeStreams.set(streamKey, {
        broadcasterSocket: null,
        viewerSockets: new Set(),
        rideStats: { speed: 0, maxSpeed: 0, distance: 0, duration: 0 },
      });
    }
    
    const stream = activeStreams.get(streamKey)!;
    
    if (role === 'broadcaster') {
      // Close existing broadcaster if any
      if (stream.broadcasterSocket) {
        stream.broadcasterSocket.close(1000, 'New broadcaster connected');
      }
      stream.broadcasterSocket = socket;
      console.log(`[Stream Relay] Broadcaster connected for stream: ${streamKey}`);
      
      // Notify viewers
      stream.viewerSockets.forEach(viewer => {
        viewer.send(JSON.stringify({ type: 'broadcaster_connected' }));
      });
    } else {
      stream.viewerSockets.add(socket);
      console.log(`[Stream Relay] Viewer connected for stream: ${streamKey}. Total viewers: ${stream.viewerSockets.size}`);
      
      // Send current state to new viewer
      socket.send(JSON.stringify({
        type: 'init',
        broadcasterConnected: !!stream.broadcasterSocket,
        stats: stream.rideStats,
      }));
    }
  };

  socket.onmessage = (event) => {
    const stream = activeStreams.get(streamKey);
    if (!stream) return;
    
    try {
      const message = JSON.parse(event.data);
      
      // Handle ride stats update from broadcaster
      if (role === 'broadcaster' && message.type === 'stats') {
        stream.rideStats = {
          speed: message.speed || 0,
          maxSpeed: message.maxSpeed || 0,
          distance: message.distance || 0,
          duration: message.duration || 0,
        };
        
        // Broadcast stats to all viewers
        const statsMessage = JSON.stringify({
          type: 'stats',
          ...stream.rideStats,
        });
        stream.viewerSockets.forEach(viewer => {
          if (viewer.readyState === WebSocket.OPEN) {
            viewer.send(statsMessage);
          }
        });
      }
      
      // Handle video frame from broadcaster (base64 encoded)
      if (role === 'broadcaster' && message.type === 'frame') {
        // Relay frame to all viewers
        const frameMessage = JSON.stringify({
          type: 'frame',
          data: message.data,
          timestamp: message.timestamp,
        });
        stream.viewerSockets.forEach(viewer => {
          if (viewer.readyState === WebSocket.OPEN) {
            viewer.send(frameMessage);
          }
        });
      }
      
      // Handle binary data (raw video frames)
      if (typeof event.data !== 'string') {
        stream.viewerSockets.forEach(viewer => {
          if (viewer.readyState === WebSocket.OPEN) {
            viewer.send(event.data);
          }
        });
      }
    } catch (e) {
      // Handle binary data directly
      if (role === 'broadcaster' && event.data instanceof ArrayBuffer) {
        stream.viewerSockets.forEach(viewer => {
          if (viewer.readyState === WebSocket.OPEN) {
            viewer.send(event.data);
          }
        });
      }
    }
  };

  socket.onclose = () => {
    const stream = activeStreams.get(streamKey);
    if (!stream) return;
    
    if (role === 'broadcaster') {
      stream.broadcasterSocket = null;
      console.log(`[Stream Relay] Broadcaster disconnected for stream: ${streamKey}`);
      
      // Notify viewers
      stream.viewerSockets.forEach(viewer => {
        if (viewer.readyState === WebSocket.OPEN) {
          viewer.send(JSON.stringify({ type: 'broadcaster_disconnected' }));
        }
      });
    } else {
      stream.viewerSockets.delete(socket);
      console.log(`[Stream Relay] Viewer disconnected for stream: ${streamKey}. Remaining viewers: ${stream.viewerSockets.size}`);
    }
    
    // Clean up empty streams
    if (!stream.broadcasterSocket && stream.viewerSockets.size === 0) {
      activeStreams.delete(streamKey);
      console.log(`[Stream Relay] Stream cleaned up: ${streamKey}`);
    }
  };

  socket.onerror = (error) => {
    console.error(`[Stream Relay] WebSocket error for ${role} on stream ${streamKey}:`, error);
  };

  return response;
});

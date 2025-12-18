import { useState } from 'react';
import { Check, X, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConvoyWaypoint } from '@/types/convoy';

interface WaypointListProps {
  waypoints: ConvoyWaypoint[];
  isLeader: boolean;
  onComplete: (id: string) => void;
  onRemove: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  completedCount: number;
  totalCount: number;
}

export function WaypointList({
  waypoints,
  isLeader,
  onComplete,
  onRemove,
  onReorder,
  completedCount,
  totalCount,
}: WaypointListProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (!isLeader) return;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (!isLeader || draggedIndex === null) return;
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    if (!isLeader || draggedIndex === null || draggedIndex === toIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }
    onReorder(draggedIndex, toIndex);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  if (waypoints.length === 0) return null;

  return (
    <div className="mb-2">
      <p className="text-muted-foreground text-[10px] uppercase tracking-wide mb-1">
        Route ({completedCount}/{totalCount} stops)
      </p>
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {waypoints.map((wp, index) => (
          <div
            key={wp.id}
            draggable={isLeader && !wp.isCompleted}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            className={cn(
              "flex items-center gap-2 bg-card border border-border rounded-lg p-2 text-xs transition-all",
              wp.isCompleted && "opacity-50",
              draggedIndex === index && "opacity-50 scale-95",
              dragOverIndex === index && draggedIndex !== index && "border-accent border-dashed",
              isLeader && !wp.isCompleted && "cursor-grab active:cursor-grabbing"
            )}
          >
            {isLeader && !wp.isCompleted && (
              <GripVertical className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            )}
            <span className={cn(
              "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0",
              wp.isCompleted ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground"
            )}>
              {wp.isCompleted ? '✓' : index + 1}
            </span>
            <span className={cn("flex-1 truncate", wp.isCompleted && "line-through")}>
              {wp.name}
            </span>
            {isLeader && !wp.isCompleted && (
              <div className="flex gap-1">
                <button
                  onClick={() => onComplete(wp.id)}
                  className="p-1 hover:bg-accent/20 rounded text-accent"
                  title="Mark complete"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  onClick={() => onRemove(wp.id)}
                  className="p-1 hover:bg-destructive/20 rounded text-destructive"
                  title="Remove"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

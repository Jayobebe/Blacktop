import { useState, useEffect } from 'react';
import { useConvoy } from '@/hooks/useConvoy';
import { ConvoyHeader } from '@/components/convoy/ConvoyHeader';
import { MemberList } from '@/components/convoy/MemberList';
import { VoiceControl } from '@/components/convoy/VoiceControl';
import { StatsPanel } from '@/components/convoy/StatsPanel';
import { DestinationPanel } from '@/components/convoy/DestinationPanel';
import { DestinationAlert } from '@/components/convoy/DestinationAlert';
import { SpeedIndicator } from '@/components/convoy/SpeedIndicator';
import { Helmet } from 'react-helmet';

const Index = () => {
  const {
    convoy,
    currentUser,
    stats,
    isSpeaking,
    setDestination,
    clearDestination,
    toggleSpeaking,
    openNavigation,
  } = useConvoy();

  const [showDestinationAlert, setShowDestinationAlert] = useState(false);
  const [lastDestination, setLastDestination] = useState(convoy.destination);

  // Show alert when destination changes (simulating real-time notification)
  useEffect(() => {
    if (convoy.destination && convoy.destination !== lastDestination) {
      setShowDestinationAlert(true);
      setLastDestination(convoy.destination);
    }
  }, [convoy.destination, lastDestination]);

  return (
    <>
      <Helmet>
        <title>Convoy - Real-time Driver Coordination</title>
        <meta name="description" content="Coordinate your convoy with low-latency voice communication, shared navigation, and real-time driving analytics." />
      </Helmet>

      <div className="min-h-screen bg-background pb-8">
        {/* Destination Alert */}
        {showDestinationAlert && convoy.destination && !currentUser.isLeader && (
          <DestinationAlert
            destination={convoy.destination}
            onOpenNavigation={openNavigation}
            onDismiss={() => setShowDestinationAlert(false)}
          />
        )}

        <div className="max-w-lg mx-auto px-4 pt-6">
          {/* Header */}
          <ConvoyHeader convoy={convoy} />

          {/* Speed Indicator */}
          <div className="mb-4">
            <SpeedIndicator
              currentSpeed={currentUser.currentSpeed}
              topSpeed={currentUser.topSpeed}
            />
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-1 gap-4">
            {/* Voice Control */}
            <VoiceControl
              isSpeaking={isSpeaking}
              onToggle={toggleSpeaking}
              memberCount={convoy.members.filter(m => m.isOnline).length}
            />

            {/* Member List */}
            <MemberList members={convoy.members} />

            {/* Destination Panel */}
            <DestinationPanel
              destination={convoy.destination}
              isLeader={currentUser.isLeader}
              onSetDestination={setDestination}
              onClearDestination={clearDestination}
              onOpenNavigation={openNavigation}
            />

            {/* Stats Panel */}
            <StatsPanel stats={stats} />
          </div>

          {/* Footer */}
          <footer className="mt-8 text-center">
            <p className="text-xs text-muted-foreground font-mono">
              CONVOY v1.0 • Low Latency Voice Comms
            </p>
          </footer>
        </div>
      </div>
    </>
  );
};

export default Index;

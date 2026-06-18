import { useEffect, useState } from 'react';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@/components/ui/carousel';
import { cn } from '@/lib/utils';
import { Disc3 } from 'lucide-react';
import { useVehicleCards } from '../hooks/useVehicleCards';
import { VehicleCard } from './VehicleCard';

export function VehicleCardCarousel() {
  const { cards, markTierSeen } = useVehicleCards();
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    onSelect();
    api.on('select', onSelect);
    return () => {
      api.off('select', onSelect);
    };
  }, [api]);

  // Mark the currently visible card as "seen" so the new-tier pulse resets.
  useEffect(() => {
    const card = cards[current];
    if (card && card.isNewTier) {
      const t = setTimeout(() => markTierSeen(card.bike.id), 1200);
      return () => clearTimeout(t);
    }
  }, [current, cards, markTierSeen]);

  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border border-border/30 bg-card/40 p-6 text-center">
        <Disc3 className="w-8 h-8 mx-auto text-muted-foreground/60 mb-2" />
        <p className="text-sm font-medium">No vehicles yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Add a vehicle in the Garage to start earning cards
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-3">
        <Disc3 className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-semibold">Vehicle Cards</h2>
        <span className="ml-auto text-xs text-muted-foreground">
          {cards.length} {cards.length === 1 ? 'vehicle' : 'vehicles'}
        </span>
      </div>

      <Carousel
        setApi={setApi}
        opts={{ align: 'center', loop: cards.length > 1 }}
        className="w-full"
      >
        <CarouselContent>
          {cards.map((c) => (
            <CarouselItem key={c.bike.id} className="flex justify-center">
              <VehicleCard card={c} />
            </CarouselItem>
          ))}
        </CarouselContent>
        {cards.length > 1 && (
          <>
            <CarouselPrevious className="left-0" />
            <CarouselNext className="right-0" />
          </>
        )}
      </Carousel>

      {cards.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {cards.map((_, i) => (
            <button
              key={i}
              onClick={() => api?.scrollTo(i)}
              aria-label={`Go to card ${i + 1}`}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === current ? 'w-6 bg-accent' : 'w-1.5 bg-muted-foreground/40',
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

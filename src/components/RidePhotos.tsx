import { useRef, useState } from 'react';
import { Plus, X, Image as ImageIcon } from 'lucide-react';
import { RidePhoto } from '@/types/blacktop';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface RidePhotosProps {
  photos: RidePhoto[];
  onAddPhoto: (photo: RidePhoto) => void;
  onRemovePhoto: (photoId: string) => void;
}

const MAX_PHOTO_SIZE = 1024 * 1024; // 1MB max after compression
const MAX_PHOTOS = 10;

export function RidePhotos({ photos, onAddPhoto, onRemovePhoto }: RidePhotosProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<RidePhoto | null>(null);

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;
          
          // Max dimension 1200px
          const maxDim = 1200;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = (height / width) * maxDim;
              width = maxDim;
            } else {
              width = (width / height) * maxDim;
              height = maxDim;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          // Start with high quality, reduce if needed
          let quality = 0.8;
          let dataUrl = canvas.toDataURL('image/jpeg', quality);
          
          while (dataUrl.length > MAX_PHOTO_SIZE && quality > 0.3) {
            quality -= 0.1;
            dataUrl = canvas.toDataURL('image/jpeg', quality);
          }
          
          resolve(dataUrl);
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    if (photos.length >= MAX_PHOTOS) {
      toast.error(`Maximum ${MAX_PHOTOS} photos per ride`);
      return;
    }

    const file = files[0];
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    try {
      const dataUrl = await compressImage(file);
      const photo: RidePhoto = {
        id: crypto.randomUUID(),
        dataUrl,
        addedAt: new Date().toISOString(),
      };
      onAddPhoto(photo);
      toast.success('Photo added');
    } catch (err) {
      toast.error('Failed to add photo');
      console.error('Photo compression error:', err);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemove = (photoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onRemovePhoto(photoId);
    toast.success('Photo removed');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          <ImageIcon className="w-4 h-4" />
          <span className="text-xs uppercase tracking-wide">Photos ({photos.length}/{MAX_PHOTOS})</span>
        </div>
      </div>

      {/* Photo Grid */}
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo) => (
          <div
            key={photo.id}
            onClick={() => setSelectedPhoto(photo)}
            className="relative aspect-square rounded-lg overflow-hidden bg-muted cursor-pointer group"
          >
            <img
              src={photo.dataUrl}
              alt="Ride photo"
              className="w-full h-full object-cover transition-transform group-hover:scale-105"
            />
            <button
              onClick={(e) => handleRemove(photo.id, e)}
              className="absolute top-1 right-1 p-1 bg-background/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}

        {/* Add Photo Button */}
        {photos.length < MAX_PHOTOS && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="aspect-square rounded-lg border-2 border-dashed border-border hover:border-accent hover:bg-accent/5 transition-colors flex flex-col items-center justify-center gap-1"
          >
            <Plus className="w-5 h-5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Add</span>
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Fullscreen Photo View */}
      {selectedPhoto && (
        <div
          onClick={() => setSelectedPhoto(null)}
          className="fixed inset-0 z-50 bg-background/95 flex items-center justify-center p-4 animate-fade-in"
        >
          <button
            onClick={() => setSelectedPhoto(null)}
            className="absolute top-4 right-4 p-2 bg-card rounded-full hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={selectedPhoto.dataUrl}
            alt="Ride photo"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

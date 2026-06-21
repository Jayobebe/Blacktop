import { z } from 'zod';

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Name required')
  .max(50, 'Name must be 50 characters or fewer');

export const convoyNameSchema = z
  .string()
  .trim()
  .min(1, 'Convoy name required')
  .max(100, 'Convoy name must be 100 characters or fewer');

export const chatMessageSchema = z
  .string()
  .trim()
  .min(1, 'Message cannot be empty')
  .max(500, 'Message must be 500 characters or fewer');

export const coordinateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const destinationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().max(500).optional().nullable(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export type ValidatedDestination = z.infer<typeof destinationSchema>;

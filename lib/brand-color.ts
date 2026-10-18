import { brandOf, type Brand } from "@/lib/provider-colors";

const known = new Map<string, Promise<Brand | null>>();

const LOGO_FILE = /\/([\w-]+\.(?:png|jpg))$/;

/** Dark ink on a light color, light ink on a dark one. */
export function inkFor([red, green, blue]: [number, number, number]): string {
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.6 ? "#0b0b0d" : "#ffffff";
}

const hex = (channels: number[]) =>
  `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;

/**
 * The background of a logo, read from its top corners: provider logos are square icons on a
 * solid color, and Amazon channels carry a white footer that the top part does not have. A transparent or inconsistent corner means there is no color to trust.
 */
export function colorFromCorners(pixels: [number, number, number, number][]): Brand | null {
  const [first] = pixels;
  if (!first) return null;
  const same = pixels.every(
    (pixel) => pixel[3] > 200 && pixel.slice(0, 3).every((v, i) => Math.abs(v - first[i]) < 24),
  );
  if (!same) return null;
  const channels: [number, number, number] = [first[0], first[1], first[2]];
  return { background: hex(channels), ink: inkFor(channels) };
}

function sample(file: string): Promise<Brand | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return resolve(null);
        context.drawImage(image, 0, 0);
        const edge = 2;
        const { width, height } = canvas;
        const read = (x: number, y: number) =>
          [...context.getImageData(x, y, 1, 1).data] as [number, number, number, number];
        resolve(
          colorFromCorners([
            read(edge, edge),
            read(width - 1 - edge, edge),
            read(edge, Math.floor(height / 4)),
            read(width - 1 - edge, Math.floor(height / 4)),
          ]),
        );
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = `/api/provider-logo?file=${encodeURIComponent(file)}`;
  });
}

/** The brand colors of a provider: the hand-made table first, then the logo itself. */
export function brandFor(providerId: string, logo: string | null): Promise<Brand | null> {
  const listed = brandOf(providerId);
  if (listed) return Promise.resolve(listed);
  const file = logo?.match(LOGO_FILE)?.[1];
  if (!file) return Promise.resolve(null);
  let pending = known.get(file);
  if (!pending) {
    pending = sample(file);
    known.set(file, pending);
  }
  return pending;
}

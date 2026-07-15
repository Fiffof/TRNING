// Icon: dark ground, teal "T" (two rectangles) inside the maskable safe zone (inner 80%).
import { PNG } from "pngjs";
import fs from "fs";
const BG = [0x0e, 0x11, 0x16], FG = [0x34, 0xd5, 0xc9];
function make(size, out) {
  const png = new PNG({ width: size, height: size });
  const px = (x, y, c) => { const i = (size * y + x) << 2; png.data[i] = c[0]; png.data[i+1] = c[1]; png.data[i+2] = c[2]; png.data[i+3] = 255; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) px(x, y, BG);
  const s = size / 512;
  const rect = (x0, y0, x1, y1) => { for (let y = Math.round(y0*s); y < Math.round(y1*s); y++) for (let x = Math.round(x0*s); x < Math.round(x1*s); x++) px(x, y, FG); };
  rect(116, 132, 396, 202); // T bar
  rect(221, 202, 291, 392); // T stem
  fs.writeFileSync(out, PNG.sync.write(png));
  console.log(out, size + "x" + size);
}
make(512, "public/icon-512.png");
make(192, "public/icon-192.png");
make(180, "public/apple-touch-icon.png");

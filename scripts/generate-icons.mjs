import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "icon-source.png");
const outDir = join(here, "..", "public", "icons");
const sizes = [16, 32, 48, 128];

mkdirSync(outDir, { recursive: true });

const script = `
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile(${psString(source)})
try {
  foreach ($size in @(${sizes.join(",")})) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $dest = New-Object System.Drawing.Rectangle 0, 0, $size, $size
    $crop = New-Object System.Drawing.Rectangle 0, 0, $src.Width, $src.Height
    $g.DrawImage($src, $dest, $crop, [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()
    $path = Join-Path ${psString(outDir)} ("icon{0}.png" -f $size)
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
  }
} finally {
  $src.Dispose()
}
`;

const result = spawnSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" });
if (result.status !== 0) {
  throw new Error(result.stderr || result.stdout || "アイコンを作成できません");
}

function psString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

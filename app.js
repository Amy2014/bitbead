const fileInput = document.querySelector("#image-file");
const widthInput = document.querySelector("#bead-width");
const colorInput = document.querySelector("#color-count");
const makeButton = document.querySelector("#make-pattern");
const downloadButton = document.querySelector("#download-pattern");
const statusMessage = document.querySelector("#status");
const patternSize = document.querySelector("#pattern-size");
const emptyState = document.querySelector("#empty-state");
const canvas = document.querySelector("#pattern-canvas");
const paletteElement = document.querySelector("#palette");
const context = canvas.getContext("2d", { willReadFrequently: true });

let sourceImage = null;
let sourceUrl = null;

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    statusMessage.textContent = "Please choose a supported image file.";
    fileInput.value = "";
    return;
  }

  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  sourceUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    sourceImage = image;
    makeButton.disabled = false;
    statusMessage.textContent = `${file.name} is ready to turn into a pattern.`;
    generatePattern();
  };
  image.onerror = () => {
    sourceImage = null;
    makeButton.disabled = true;
    statusMessage.textContent = "That image could not be opened. Try another file.";
    URL.revokeObjectURL(sourceUrl);
    sourceUrl = null;
  };
  image.src = sourceUrl;
});

makeButton.addEventListener("click", generatePattern);
widthInput.addEventListener("change", generatePattern);
colorInput.addEventListener("change", generatePattern);

downloadButton.addEventListener("click", () => {
  if (!canvas.width || !canvas.height) return;
  const link = document.createElement("a");
  link.download = "bitbead-pattern.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});

function boundedInteger(input, minimum, maximum) {
  const value = Number.parseInt(input.value, 10);
  const bounded = Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : minimum;
  input.value = String(bounded);
  return bounded;
}

function generatePattern() {
  if (!sourceImage || !sourceImage.naturalWidth || !sourceImage.naturalHeight) return;

  const columns = boundedInteger(widthInput, 1, 200);
  const maxColors = boundedInteger(colorInput, 2, 32);
  const rows = Math.max(1, Math.min(200, Math.round(columns * sourceImage.naturalHeight / sourceImage.naturalWidth)));
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = columns;
  sampleCanvas.height = rows;
  const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });

  sampleContext.fillStyle = "#ffffff";
  sampleContext.fillRect(0, 0, columns, rows);
  sampleContext.drawImage(sourceImage, 0, 0, columns, rows);

  const pixels = sampleContext.getImageData(0, 0, columns, rows).data;
  const colors = choosePalette(pixels, maxColors);
  const beadColors = [];
  for (let index = 0; index < pixels.length; index += 4) {
    beadColors.push(nearestColor(pixels[index], pixels[index + 1], pixels[index + 2], colors));
  }

  drawPattern(beadColors, columns, rows);
  drawPalette(beadColors, colors);
  patternSize.textContent = `${columns} × ${rows} beads`;
  emptyState.hidden = true;
  canvas.hidden = false;
  downloadButton.disabled = false;
  statusMessage.textContent = `Pattern ready with ${colors.length} colors.`;
}

function choosePalette(pixels, maxColors) {
  const buckets = new Map();
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const key = `${red >> 3},${green >> 3},${blue >> 3}`;
    const bucket = buckets.get(key) ?? { red: 0, green: 0, blue: 0, count: 0 };
    bucket.red += red;
    bucket.green += green;
    bucket.blue += blue;
    bucket.count += 1;
    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .sort((first, second) => second.count - first.count)
    .slice(0, maxColors)
    .map((bucket) => ({
      red: Math.round(bucket.red / bucket.count),
      green: Math.round(bucket.green / bucket.count),
      blue: Math.round(bucket.blue / bucket.count),
      count: 0,
    }));
}

function nearestColor(red, green, blue, colors) {
  let nearest = colors[0];
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const color of colors) {
    const distance = (red - color.red) ** 2 + (green - color.green) ** 2 + (blue - color.blue) ** 2;
    if (distance < nearestDistance) {
      nearest = color;
      nearestDistance = distance;
    }
  }
  nearest.count += 1;
  return nearest;
}

function drawPattern(beadColors, columns, rows) {
  const cellSize = Math.max(8, Math.min(24, Math.floor(1200 / Math.max(columns, rows))));
  canvas.width = columns * cellSize;
  canvas.height = rows * cellSize;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  beadColors.forEach((color, index) => {
    const x = (index % columns) * cellSize;
    const y = Math.floor(index / columns) * cellSize;
    context.fillStyle = `rgb(${color.red} ${color.green} ${color.blue})`;
    context.fillRect(x, y, cellSize, cellSize);
  });

  if (cellSize >= 10) {
    context.beginPath();
    context.strokeStyle = "rgba(35, 31, 26, 0.2)";
    context.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += cellSize) {
      context.moveTo(x + 0.5, 0);
      context.lineTo(x + 0.5, canvas.height);
    }
    for (let y = 0; y <= canvas.height; y += cellSize) {
      context.moveTo(0, y + 0.5);
      context.lineTo(canvas.width, y + 0.5);
    }
    context.stroke();
  }
}

function drawPalette(beadColors, colors) {
  const usedColors = colors.filter((color) => color.count > 0);
  paletteElement.replaceChildren();
  usedColors.forEach((color, index) => {
    const item = document.createElement("span");
    item.className = "palette-item";

    const swatch = document.createElement("span");
    swatch.className = "palette-swatch";
    swatch.style.backgroundColor = `rgb(${color.red} ${color.green} ${color.blue})`;
    swatch.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.textContent = `#${String(index + 1).padStart(2, "0")} · ${color.count} beads`;
    item.append(swatch, label);
    paletteElement.append(item);
  });
}

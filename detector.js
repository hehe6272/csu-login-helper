(() => {
  const regions = {
    first: {x: 28, y: 14, width: 37, height: 34},
    operator: {x: 65, y: 9, width: 38, height: 38},
    second: {x: 99, y: 14, width: 41, height: 34}
  };
  const thresholds = [110, 150, 190];

  function decode(items) {
    return items.map(item => {
      const bytes = atob(item.pixels);
      const pixels = new Uint8Array(1024);
      for (let i = 0; i < 512; i++) {
        pixels[i * 2] = bytes.charCodeAt(i) >> 4;
        pixels[i * 2 + 1] = bytes.charCodeAt(i) & 15;
      }
      return {label: item.label, pixels};
    });
  }

  const digits = decode(globalThis.CsuModelData.digits);
  const operators = decode(globalThis.CsuModelData.operators);

  function components(imageData, threshold) {
    const {width, height, data} = imageData;
    const dark = new Uint8Array(width * height);
    for (let i = 0; i < dark.length; i++) {
      const p = i * 4;
      dark[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2] < threshold ? 1 : 0;
    }
    const seen = new Uint8Array(dark.length);
    const parts = [];
    for (let start = 0; start < dark.length; start++) {
      if (!dark[start] || seen[start]) continue;
      const stack = [start], part = [];
      seen[start] = 1;
      while (stack.length) {
        const index = stack.pop();
        part.push(index);
        const x = index % width, y = Math.floor(index / width);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (dark[next] && !seen[next]) { seen[next] = 1; stack.push(next); }
        }
      }
      if (part.length >= 5) parts.push(part);
    }
    parts.sort((a, b) => b.length - a.length);
    if (!parts.length) return null;
    const minimum = Math.max(5, parts[0].length * 0.07);
    const mask = new Uint8Array(dark.length);
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (const part of parts) {
      if (part.length < minimum) continue;
      for (const index of part) {
        mask[index] = 1;
        const x = index % width, y = Math.floor(index / width);
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
    return {mask, width, height, x0, y0, x1, y1};
  }

  function normalize(processed) {
    const source = document.createElement('canvas');
    source.width = processed.width;
    source.height = processed.height;
    const sourceContext = source.getContext('2d');
    const sourceData = sourceContext.createImageData(source.width, source.height);
    for (let i = 0; i < processed.mask.length; i++) {
      const value = processed.mask[i] ? 0 : 255;
      sourceData.data.set([value, value, value, 255], i * 4);
    }
    sourceContext.putImageData(sourceData, 0, 0);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const context = canvas.getContext('2d');
    context.fillStyle = 'white';
    context.fillRect(0, 0, 32, 32);
    const width = processed.x1 - processed.x0 + 1;
    const height = processed.y1 - processed.y0 + 1;
    const scale = Math.min(28 / width, 28 / height);
    const drawWidth = Math.max(1, Math.round(width * scale));
    const drawHeight = Math.max(1, Math.round(height * scale));
    context.imageSmoothingEnabled = true;
    context.drawImage(source, processed.x0, processed.y0, width, height,
      Math.floor((32 - drawWidth) / 2), Math.floor((32 - drawHeight) / 2), drawWidth, drawHeight);
    const data = context.getImageData(0, 0, 32, 32).data;
    const pixels = new Uint8Array(1024);
    for (let i = 0; i < 1024; i++) pixels[i] = Math.min(15, Math.round(data[i * 4] / 17));
    return pixels;
  }

  function match(context, region, model) {
    const image = context.getImageData(region.x, region.y, region.width, region.height);
    const scores = new Map();
    for (const threshold of thresholds) {
      const processed = components(image, threshold);
      if (!processed) continue;
      const pixels = normalize(processed);
      for (const template of model) {
        let total = 0;
        for (let i = 0; i < 1024; i++) total += Math.abs(pixels[i] - template.pixels[i]);
        const score = total * 17 / 1024;
        if (score < (scores.get(template.label) ?? Infinity)) scores.set(template.label, score);
      }
    }
    const sorted = [...scores].sort((a, b) => a[1] - b[1]);
    return {label: sorted[0]?.[0], score: sorted[0]?.[1] ?? Infinity,
      margin: (sorted[1]?.[1] ?? Infinity) - (sorted[0]?.[1] ?? Infinity)};
  }

  function analyzeAt(image, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', {willReadFrequently: true});
    context.fillStyle = 'white';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const scaleX = width / 180;
    const scaleY = height / 50;
    const scaleRegion = region => ({
      x: Math.round(region.x * scaleX),
      y: Math.round(region.y * scaleY),
      width: Math.max(1, Math.round(region.width * scaleX)),
      height: Math.max(1, Math.round(region.height * scaleY))
    });
    const first = match(context, scaleRegion(regions.first), digits);
    const operator = match(context, scaleRegion(regions.operator), operators);
    const second = match(context, scaleRegion(regions.second), digits);
    return {first, operator, second};
  }

  function analyze(image) {
    const nativeWidth = Number(image.naturalWidth) || 180;
    const nativeHeight = Number(image.naturalHeight) || 50;
    const native = analyzeAt(image, nativeWidth, nativeHeight);
    if (nativeWidth <= 100 && nativeHeight <= 40) return native;
    return analyzeAt(image, 180, 50);
  }

  function solve(image) {
    const {first, operator, second} = analyze(image);
    if (!first.label || !operator.label || !second.label) return null;
    const a = Number(first.label), b = Number(second.label);
    const answer = String(operator.label === '+' ? a + b : a * b);
    if (!/^\d{1,2}$/.test(answer)) return null;
    const confident = first.score <= 27 && first.margin >= 6 && operator.score <= 28 && operator.margin >= 8 && second.score <= 27 && second.margin >= 6;
    return {answer, formula: `${a}${operator.label}${b}`, confidence: confident ? 'high' : 'low'};
  }

  globalThis.CsuDetector = {solve, analyze};
})();

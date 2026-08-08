const QR_CAPACITY = {
  1: { dataCodewords: 19, ecCodewords: 7, alignment: [], blocks: [{ count: 1, dataCodewords: 19 }] },
  2: { dataCodewords: 34, ecCodewords: 10, alignment: [6, 18], blocks: [{ count: 1, dataCodewords: 34 }] },
  3: { dataCodewords: 55, ecCodewords: 15, alignment: [6, 22], blocks: [{ count: 1, dataCodewords: 55 }] },
  4: { dataCodewords: 80, ecCodewords: 20, alignment: [6, 26], blocks: [{ count: 1, dataCodewords: 80 }] },
  5: { dataCodewords: 108, ecCodewords: 26, alignment: [6, 30], blocks: [{ count: 1, dataCodewords: 108 }] },
  6: { dataCodewords: 136, ecCodewords: 18, alignment: [6, 34], blocks: [{ count: 2, dataCodewords: 68 }] },
  7: { dataCodewords: 156, ecCodewords: 20, alignment: [6, 22, 38], blocks: [{ count: 2, dataCodewords: 78 }] },
  8: { dataCodewords: 194, ecCodewords: 24, alignment: [6, 24, 42], blocks: [{ count: 2, dataCodewords: 97 }] },
  9: { dataCodewords: 232, ecCodewords: 30, alignment: [6, 26, 46], blocks: [{ count: 2, dataCodewords: 116 }] },
  10: {
    dataCodewords: 274,
    ecCodewords: 18,
    alignment: [6, 28, 50],
    blocks: [
      { count: 2, dataCodewords: 68 },
      { count: 2, dataCodewords: 69 },
    ],
  },
};

const GF_EXP = Array(512);
const GF_LOG = Array(256);

let value = 1;
for (let i = 0; i < 255; i += 1) {
  GF_EXP[i] = value;
  GF_LOG[value] = i;
  value <<= 1;
  if (value & 0x100) {
    value ^= 0x11d;
  }
}
for (let i = 255; i < 512; i += 1) {
  GF_EXP[i] = GF_EXP[i - 255];
}

const gfMul = (left, right) => {
  if (left === 0 || right === 0) {
    return 0;
  }

  return GF_EXP[GF_LOG[left] + GF_LOG[right]];
};

const buildGenerator = (degree) => {
  let result = [1];

  for (let i = 0; i < degree; i += 1) {
    const next = Array(result.length + 1).fill(0);

    for (let j = 0; j < result.length; j += 1) {
      next[j] ^= result[j];
      next[j + 1] ^= gfMul(result[j], GF_EXP[i]);
    }

    result = next;
  }

  return result;
};

const buildErrorCorrection = (data, degree) => {
  const generator = buildGenerator(degree);
  const result = Array(degree).fill(0);

  data.forEach((byte) => {
    const factor = byte ^ result.shift();
    result.push(0);

    for (let i = 0; i < degree; i += 1) {
      result[i] ^= gfMul(generator[i + 1], factor);
    }
  });

  return result;
};

const addBits = (bits, valueToAdd, length) => {
  for (let i = length - 1; i >= 0; i -= 1) {
    bits.push((valueToAdd >>> i) & 1);
  }
};

const bitsToBytes = (bits) => {
  const bytes = [];

  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;

    for (let bit = 0; bit < 8; bit += 1) {
      byte = (byte << 1) | (bits[i + bit] || 0);
    }

    bytes.push(byte);
  }

  return bytes;
};

const encodeText = (text, version) => {
  const encoder = new TextEncoder();
  const bytes = [...encoder.encode(text)];
  const capacity = QR_CAPACITY[version].dataCodewords;
  const countBits = version < 10 ? 8 : 16;
  const bits = [];

  addBits(bits, 0b0100, 4);
  addBits(bits, bytes.length, countBits);
  bytes.forEach((byte) => addBits(bits, byte, 8));
  addBits(bits, 0, Math.min(4, capacity * 8 - bits.length));

  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const data = bitsToBytes(bits);
  const pads = [0xec, 0x11];
  let padIndex = 0;

  while (data.length < capacity) {
    data.push(pads[padIndex % 2]);
    padIndex += 1;
  }

  return data;
};

const pickVersion = (text) => {
  const byteLength = new TextEncoder().encode(text).length;

  for (let version = 1; version <= 10; version += 1) {
    const countBits = version < 10 ? 8 : 16;

    if (4 + countBits + byteLength * 8 <= QR_CAPACITY[version].dataCodewords * 8) {
      return version;
    }
  }

  throw new Error("URL is too long for this generator.");
};

const splitIntoBlocks = (data, version) => {
  const blocks = [];
  let index = 0;

  QR_CAPACITY[version].blocks.forEach((group) => {
    for (let i = 0; i < group.count; i += 1) {
      const blockData = data.slice(index, index + group.dataCodewords);
      index += group.dataCodewords;
      blocks.push({
        data: blockData,
        errorCorrection: buildErrorCorrection(blockData, QR_CAPACITY[version].ecCodewords),
      });
    }
  });

  return blocks;
};

const interleaveBlocks = (blocks, ecCodewords) => {
  const result = [];
  const maxDataLength = Math.max(...blocks.map((block) => block.data.length));

  for (let i = 0; i < maxDataLength; i += 1) {
    blocks.forEach((block) => {
      if (i < block.data.length) {
        result.push(block.data[i]);
      }
    });
  }

  for (let i = 0; i < ecCodewords; i += 1) {
    blocks.forEach((block) => {
      result.push(block.errorCorrection[i]);
    });
  }

  return result;
};

const createMatrix = (size) => ({
  modules: Array.from({ length: size }, () => Array(size).fill(false)),
  reserved: Array.from({ length: size }, () => Array(size).fill(false)),
});

const setModule = (matrix, x, y, dark, reserve = true) => {
  if (x < 0 || y < 0 || y >= matrix.modules.length || x >= matrix.modules.length) {
    return;
  }

  matrix.modules[y][x] = dark;
  if (reserve) {
    matrix.reserved[y][x] = true;
  }
};

const addFinder = (matrix, startX, startY) => {
  for (let y = -1; y <= 7; y += 1) {
    for (let x = -1; x <= 7; x += 1) {
      const xx = startX + x;
      const yy = startY + y;
      const isFinder =
        x >= 0 &&
        x <= 6 &&
        y >= 0 &&
        y <= 6 &&
        (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));

      setModule(matrix, xx, yy, isFinder);
    }
  }
};

const addAlignment = (matrix, centerX, centerY) => {
  for (let y = -2; y <= 2; y += 1) {
    for (let x = -2; x <= 2; x += 1) {
      const distance = Math.max(Math.abs(x), Math.abs(y));
      setModule(matrix, centerX + x, centerY + y, distance !== 1);
    }
  }
};

const addFunctionPatterns = (matrix, version) => {
  const size = matrix.modules.length;

  addFinder(matrix, 0, 0);
  addFinder(matrix, size - 7, 0);
  addFinder(matrix, 0, size - 7);

  for (let i = 8; i < size - 8; i += 1) {
    setModule(matrix, i, 6, i % 2 === 0);
    setModule(matrix, 6, i, i % 2 === 0);
  }

  QR_CAPACITY[version].alignment.forEach((x) => {
    QR_CAPACITY[version].alignment.forEach((y) => {
      const nearTop = y < 9;
      const nearLeft = x < 9;
      const nearRight = x > size - 10;

      if ((nearTop && nearLeft) || (nearTop && nearRight) || (nearLeft && y > size - 10)) {
        return;
      }

      addAlignment(matrix, x, y);
    });
  });

  for (let i = 0; i <= 5; i += 1) {
    setModule(matrix, 8, i, false);
  }
  setModule(matrix, 8, 7, false);
  setModule(matrix, 8, 8, false);
  setModule(matrix, 7, 8, false);
  for (let i = 9; i < 15; i += 1) {
    setModule(matrix, 14 - i, 8, false);
  }

  for (let i = 0; i < 8; i += 1) {
    setModule(matrix, size - 1 - i, 8, false);
  }
  for (let i = 8; i < 15; i += 1) {
    setModule(matrix, 8, size - 15 + i, false);
  }

  setModule(matrix, 8, size - 8, true);

  if (version >= 7) {
    for (let i = 0; i < 18; i += 1) {
      setModule(matrix, size - 11 + (i % 3), Math.floor(i / 3), false);
      setModule(matrix, Math.floor(i / 3), size - 11 + (i % 3), false);
    }
  }
};

const maskBit = (x, y) => (x + y) % 2 === 0;

const addData = (matrix, codewords) => {
  const size = matrix.modules.length;
  const bits = [];

  codewords.forEach((byte) => addBits(bits, byte, 8));

  let bitIndex = 0;
  let direction = -1;
  let y = size - 1;

  for (let x = size - 1; x > 0; x -= 2) {
    if (x === 6) {
      x -= 1;
    }

    while (y >= 0 && y < size) {
      for (let offset = 0; offset < 2; offset += 1) {
        const xx = x - offset;

        if (!matrix.reserved[y][xx]) {
          const bit = bits[bitIndex] === 1;
          matrix.modules[y][xx] = bit !== maskBit(xx, y);
          bitIndex += 1;
        }
      }

      y += direction;
    }

    y -= direction;
    direction *= -1;
  }
};

const bchRemainder = (valueToEncode, polynomial) => {
  let value = valueToEncode;
  const degree = Math.floor(Math.log2(polynomial));

  while (Math.floor(Math.log2(value)) >= degree) {
    value ^= polynomial << (Math.floor(Math.log2(value)) - degree);
  }

  return value;
};

const addFormatInfo = (matrix) => {
  const size = matrix.modules.length;
  const errorCorrectionLow = 1;
  const mask = 0;
  const data = (errorCorrectionLow << 3) | mask;
  const format = ((data << 10) | bchRemainder(data << 10, 0x537)) ^ 0x5412;
  const bit = (index) => ((format >>> index) & 1) === 1;

  for (let i = 0; i <= 5; i += 1) {
    setModule(matrix, 8, i, bit(i));
  }
  setModule(matrix, 8, 7, bit(6));
  setModule(matrix, 8, 8, bit(7));
  setModule(matrix, 7, 8, bit(8));
  for (let i = 9; i < 15; i += 1) {
    setModule(matrix, 14 - i, 8, bit(i));
  }

  for (let i = 0; i < 8; i += 1) {
    setModule(matrix, size - 1 - i, 8, bit(i));
  }
  for (let i = 8; i < 15; i += 1) {
    setModule(matrix, 8, size - 15 + i, bit(i));
  }
};

const addVersionInfo = (matrix, version) => {
  if (version < 7) {
    return;
  }

  const size = matrix.modules.length;
  const data = version << 12;
  const versionInfo = data | bchRemainder(data, 0x1f25);
  const bit = (index) => ((versionInfo >>> index) & 1) === 1;

  for (let i = 0; i < 18; i += 1) {
    setModule(matrix, size - 11 + (i % 3), Math.floor(i / 3), bit(i));
    setModule(matrix, Math.floor(i / 3), size - 11 + (i % 3), bit(i));
  }
};

const drawQrToCanvas = (canvas, text, options = {}) => {
  const version = pickVersion(text);
  const size = 21 + (version - 1) * 4;
  const matrix = createMatrix(size);
  const data = encodeText(text, version);
  const blocks = splitIntoBlocks(data, version);
  const codewords = interleaveBlocks(blocks, QR_CAPACITY[version].ecCodewords);

  addFunctionPatterns(matrix, version);
  addData(matrix, codewords);
  addFormatInfo(matrix);
  addVersionInfo(matrix, version);

  const quietZone = 4;
  const pixelSize = options.width || 280;
  const scale = Math.floor(pixelSize / (size + quietZone * 2));
  const actualSize = (size + quietZone * 2) * scale;
  const context = canvas.getContext("2d");

  canvas.width = actualSize;
  canvas.height = actualSize;
  context.fillStyle = options.light || "#ffffff";
  context.fillRect(0, 0, actualSize, actualSize);
  context.fillStyle = options.dark || "#142033";

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (matrix.modules[y][x]) {
        context.fillRect((x + quietZone) * scale, (y + quietZone) * scale, scale, scale);
      }
    }
  }
};

window.drawQrToCanvas = drawQrToCanvas;

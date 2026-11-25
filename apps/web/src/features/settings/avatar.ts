const TARGET_SIZE = 256;
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const MAX_DATA_URL_LENGTH = 96_000;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片解析失败，请换一张图片'));
    image.src = url;
  });
}

function renderSquare(image: HTMLImageElement, size: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器不支持图片处理');
  const side = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = Math.max(0, (image.naturalWidth - side) / 2);
  const sourceY = Math.max(0, (image.naturalHeight - side) / 2);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, sourceX, sourceY, side, side, 0, 0, size, size);
  return canvas.toDataURL('image/webp', 0.82);
}

export async function prepareAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择图片文件');
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('原图不能超过 5MB');
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    let dataUrl = renderSquare(image, TARGET_SIZE);
    if (!dataUrl.startsWith('data:image/')) {
      throw new Error('图片格式不受支持');
    }
    if (!/^data:image\/(?:png|jpeg|webp);base64,/.test(dataUrl)) {
      throw new Error('图片格式不受支持，请使用 JPG、PNG 或 WebP');
    }
    if (dataUrl.length > MAX_DATA_URL_LENGTH) {
      dataUrl = renderSquare(image, 192);
    }
    if (dataUrl.length > MAX_DATA_URL_LENGTH) {
      throw new Error('图片过于复杂，请换一张尺寸更小的图片');
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

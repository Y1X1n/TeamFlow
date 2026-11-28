import { detectAttachmentSignature } from './attachments.service';

function zipWith(names: string[]): Buffer {
  return Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from(names.join('\n'), 'utf8'),
  ]);
}

describe('detectAttachmentSignature', () => {
  it('accepts real Office Open XML layouts', () => {
    expect(detectAttachmentSignature(zipWith(['[Content_Types].xml', 'word/document.xml']), 'docx')).toBe(
      true,
    );
    expect(detectAttachmentSignature(zipWith(['[Content_Types].xml', 'xl/workbook.xml']), 'xlsx')).toBe(
      true,
    );
    expect(
      detectAttachmentSignature(zipWith(['[Content_Types].xml', 'ppt/presentation.xml']), 'pptx'),
    ).toBe(true);
  });

  it('rejects arbitrary ZIP files renamed to Office extensions', () => {
    const plainZip = zipWith(['photos/image.png']);

    expect(detectAttachmentSignature(plainZip, 'docx')).toBe(false);
    expect(detectAttachmentSignature(plainZip, 'xlsx')).toBe(false);
    expect(detectAttachmentSignature(plainZip, 'pptx')).toBe(false);
  });

  it('rejects mismatched Office internals', () => {
    const docx = zipWith(['[Content_Types].xml', 'word/document.xml']);

    expect(detectAttachmentSignature(docx, 'xlsx')).toBe(false);
    expect(detectAttachmentSignature(docx, 'pptx')).toBe(false);
  });

  it('keeps existing image and PDF detection', () => {
    expect(detectAttachmentSignature(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'png')).toBe(true);
    expect(detectAttachmentSignature(Buffer.from('%PDF-1.7'), 'pdf')).toBe(true);
    expect(detectAttachmentSignature(Buffer.from('hello'), 'pdf')).toBe(false);
  });
});

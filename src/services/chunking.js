function chunkText(text, chunkSize = 300, overlap = 50) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end).trim());

    if (end === text.length) break;
    start += chunkSize - overlap;
  }

  return chunks.filter(chunk => chunk.length > 0);
}

module.exports = { chunkText };
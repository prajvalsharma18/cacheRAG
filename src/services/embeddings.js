async function embed(text) {
  const start = Date.now();

  const response = await fetch('http://localhost:8000/embed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });

  if (!response.ok) {
    throw new Error(`Embedding service returned ${response.status}`);
  }

  const data = await response.json();
  const durationMs = Date.now() - start; // includes network round-trip now

  return {
    vector: data.vector,
    dimensions: data.dimensions,
    durationMs
  };
}

module.exports = { embed };
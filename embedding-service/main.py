from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
import time

app = FastAPI()

print("Loading embedding model (bge-small-en-v1.5)...")
start_load = time.time()
model = SentenceTransformer('BAAI/bge-small-en-v1.5')
model_load_time_ms = (time.time() - start_load) * 1000
print(f"Model loaded in {model_load_time_ms:.2f}ms")


class EmbedRequest(BaseModel):
    text: str


@app.post("/embed")
async def embed(payload: EmbedRequest):
    start = time.time()
    vector = model.encode(payload.text, normalize_embeddings=True).tolist()
    duration_ms = (time.time() - start) * 1000

    return {
        "vector": vector,
        "dimensions": len(vector),
        "durationMs": round(duration_ms, 2)
    }


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "modelLoadTimeMs": round(model_load_time_ms, 2)
    }
    
CacheRAG 

Intelligent caching layer for RAG applications that reduces LLM latency, token usage, and unnecessary AI generation costs.

CacheRAG is a performance optimization layer built on top of Retrieval-Augmented Generation (RAG) systems. 

It improves the efficiency of LLM applications by intelligently caching previous responses and avoiding repeated retrieval and generation steps.

Instead of processing every query through the complete RAG pipeline it does

User Query
↓
Exact Cache (Redis)
↓
Semantic Cache (Embeddings)
↓
RAG Pipeline (Retrieval + MMR + LLM)
↓
Store Response

## Features

1) Multi-Level Caching

Exact Cache
- Checks previously answered identical queries.
- Provides instant responses without calling the LLM.

Semantic Cache**
- Uses embeddings to understand query meaning.
- Detects similar questions even with different wording.

Example:

"What is Redis used for?"
"Why do developers use Redis?"

Both queries can reuse the same cached response.

2) Optimized RAG Pipeline

For new queries:

Query
↓
Generate Embedding
↓
Retrieve Relevant Documents
↓
MMR Reranking
↓
Context Selection
↓
LLM Generation
↓
Cache Response

3) MMR (Maximal Marginal Relevance) improves retrieval quality by reducing duplicate chunks and selecting diverse, useful context before sending information to the LLM.

Tested on 100 queries

Metric	       Standard RAG    	CacheRAG	 Improvement
Average Latency	     564.8 ms	   187.68 ms	66.7% faster
Total Tokens Used	    58,920	      3,394	     94.2% reduction
Average Tokens / Query	589.2	      33.94	    94.2% reduction



ARCHITECTURE

                         ┌───────────────┐
                         │   User Query  │
                         └───────┬───────┘
                                 │
                                 ▼
                    ┌──────────────────────┐
                    │   Exact Cache Check  │
                    │       (Redis)        │
                    └──────────┬───────────┘
                               │
                 Cache Hit     │     Cache Miss
                    │          │
                    ▼          ▼
            ┌───────────┐  ┌─────────────────────┐
            │  Return   │  │  Semantic Cache     │
            │ Response  │  │ (Embedding Search)  │
            └───────────┘  └──────────┬──────────┘
                                      │
                         Cache Hit    │    Cache Miss
                             │        │
                             ▼        ▼
                     ┌───────────┐  ┌──────────────────┐
                     │  Return   │  │ Document         │
                     │ Response  │  │ Retrieval        │
                     └───────────┘  └────────┬─────────┘
                                             │
                                             ▼
                                  ┌──────────────────┐
                                  │ MMR Reranking    │
                                  │ (Diverse Context)│
                                  └────────┬─────────┘
                                           │
                                           ▼
                                  ┌──────────────────┐
                                  │ LLM Generation   │
                                  │ Answer Creation  │
                                  └────────┬─────────┘
                                           │
                                           ▼
                                  ┌──────────────────┐
                                  │ Store Response   │
                                  │ In Cache         │
                                  └──────────────────┘

## 🛠️ Tech Stack

**Backend**
- Node.js
- Express.js

**Caching**
- Redis
- Exact Query Cache
- Semantic Cache

**AI Components**
- Embeddings
- Vector Similarity Search
- Retrieval-Augmented Generation (RAG)
- MMR Reranking

**LLM Layer**
- LLM API integration for response generation


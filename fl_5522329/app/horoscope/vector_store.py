from __future__ import annotations

import threading

from app.horoscope.knowledge import get_all_records

_LOCK = threading.Lock()
_STORE: VectorStore | None = None


class VectorStore:
    def __init__(self, path: str = "data/chroma", collection: str = "astro_knowledge") -> None:
        import chromadb

        self._top_k = 5
        self.client = chromadb.PersistentClient(path=path)
        self.collection = self._init_collection(collection)

    def _init_collection(self, name: str):
        col = self.client.get_or_create_collection(
            name=name,
            metadata={"description": "Астрологические интерпретации для RAG"},
        )
        if col.count() == 0:
            self._populate(col)
        return col

    def _populate(self, col) -> None:
        records = get_all_records()
        col.add(
            documents=[item["text"] for item in records],
            metadatas=[item["metadata"] for item in records],
            ids=[f"rec_{index}" for index in range(len(records))],
        )

    def retrieve(self, query: str, top_k: int = 5) -> list[dict]:
        results = self.collection.query(query_texts=[query], n_results=top_k)
        documents = (results.get("documents") or [[]])[0]
        metadatas = (results.get("metadatas") or [[]])[0]
        distances = (results.get("distances") or [[]])[0]
        items = []
        for index, text in enumerate(documents):
            meta = metadatas[index] if index < len(metadatas) and isinstance(metadatas[index], dict) else {}
            distance = distances[index] if index < len(distances) else None
            items.append({"text": text, "metadata": meta, "distance": distance})
        return items


def get_vector_store(path: str) -> VectorStore:
    global _STORE
    with _LOCK:
        if _STORE is None:
            _STORE = VectorStore(path)
        return _STORE


def warm(path: str = "data/chroma") -> None:
    get_vector_store(path)

# Retrieval-Augmented Generation (RAG)
Tags: ai, nlp, technique, llm

## Definition
A technique that enhances the capabilities of Large Language Models (LLMs) by retrieving relevant information from an external knowledge base before generating a response.

## How It Works
1. User query is received.
2. Relevant documents or data snippets are retrieved from a knowledge source (e.g., a database, document store).
3. The retrieved information is combined with the original query to form an augmented prompt.
4. The LLM uses this augmented prompt to generate a more informed and contextually accurate response.

## Benefits
- Reduces LLM hallucinations by grounding responses in factual data.
- Allows LLMs to access up-to-date or domain-specific information without retraining.
- Improves the relevance and accuracy of generated text.

## Related
- [[llm]] — RAG is a method to improve LLM performance.
- [[entities/lumina-pro]] — Lumina AI is a RAG platform.
- [[concepts/context-engineering]] — Effective RAG relies on good context management.
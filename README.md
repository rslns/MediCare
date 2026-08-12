
---

# MediCare — README

```markdown
# MediCare

> An AI-powered medical report explainer designed to make complex medical information easier to understand.

🔗 **Live Demo:** https://y-two-steel-75.vercel.app/

---

## The Problem

Medical reports are written for clinical precision—not everyday readability.

Terms, abbreviations, reference ranges, and clinical measurements can make even a straightforward report difficult for a non-medical person to understand.

The problem I wanted to explore was:

**Can an AI system turn a complex medical report into something a normal person can understand without pretending to replace a doctor?**

That question became MediCare.

---

## What I Built

MediCare allows users to provide medical reports in formats such as:

- PDF
- PNG
- JPG

The system uses AI to analyze the report and explain its contents in simpler language.

Depending on the report, it can help surface:

- Important parameters
- HIGH / LOW / NORMAL indicators
- Simplified explanations
- Supporting food and lifestyle information
- Easy-to-understand interpretations

The application supports:

🇬🇧 English  
🇮🇳 Hindi  
🇮🇳 Telugu

---

## How AI Fits Into the Product

The LLM is used as the core interpretation and language-generation layer.

```text
Medical Report
      │
      ▼
PDF / Image Input
      │
      ▼
Report Content Analysis
      │
      ▼
Claude AI
      │
      ├── Identify relevant information
      ├── Interpret report content
      ├── Simplify technical terminology
      └── Generate user-friendly explanation
      │
      ▼
Structured User Experience
      │
      ├── Report Explanation
      ├── HIGH / LOW / NORMAL
      └── Supporting Guidance

export const faq = [
  [
    "What formats can I submit?",
    "Paper Checker supports PDF, DOCX, TXT and pasted text. PDFs need a selectable text layer.",
  ],
  [
    "What does the AI detection score mean?",
    "The browser model estimates the likelihood that a document contains AI-generated writing. Human writing can be flagged and AI writing can be missed. Use the result as one input to a human review.",
  ],
  [
    "How is writing quality assessed?",
    "Gemini applies an academic writing rubric covering grammar, tone, readability, vocabulary, coherence and structure.",
  ],
  [
    "Are my documents stored?",
    "Original files stay in browser memory. Paper Checker saves scan metadata and numerical results by default. You can opt in to retaining extracted text and detailed feedback.",
  ],
  [
    "Where is document text processed?",
    "Detection runs in your browser. If you consent, extracted text is sent to Google Gemini for writing analysis. Google’s service terms govern its retention and handling.",
  ],
  [
    "Does Paper Checker check plagiarism?",
    "Paper Checker provides AI detection and writing feedback. It does not provide plagiarism or similarity reports.",
  ],
];
export const pages: Record<
  string,
  { title: string; intro: string; sections: string[][] }
> = {
  features: {
    title: "Features",
    intro:
      "AI detection and academic writing feedback in one review workspace.",
    sections: [
      [
        "AI writing detection",
        "Review the browser-generated estimate and inspect scored passages.",
      ],
      [
        "Academic writing feedback",
        "Explore rubric scores, verified excerpts and suggested revisions.",
      ],
      [
        "Document review",
        "Read a PDF or DOCX alongside its analysis, switch to extracted text and export a PDF report.",
      ],
      [
        "Private workspace",
        "Revisit your own reports, compare scans and manage text retention.",
      ],
    ],
  },
  "how-it-works": {
    title: "How it works",
    intro: "Go from document to actionable feedback in three steps.",
    sections: [
      ["Add a document", "Choose a PDF, DOCX or TXT file, or paste text."],
      [
        "Start your analysis",
        "Review the data-processing notice and select Analyze Document.",
      ],
      [
        "Review your report",
        "Inspect provider results and download feedback while the document is open.",
      ],
    ],
  },
  about: {
    title: "About Paper Checker",
    intro:
      "Paper Checker is an independent, open-source academic writing analysis project.",
    sections: [
      [
        "Designed for review",
        "Use AI detection estimates and writing feedback to guide a closer reading. Paper Checker has no affiliation with Turnitin.",
      ],
      [
        "Built for academic writing",
        "Review essays, research papers, assignments and thesis drafts in one workspace.",
      ],
    ],
  },
  methodology: {
    title: "Methodology",
    intro: "How Paper Checker calculates and presents its results.",
    sections: [
      [
        "AI detection",
        "The browser model produces a score for each passage. Paper Checker weights these scores by character count to estimate a document-level score. The server does not independently verify browser-generated scores.",
      ],
      [
        "Flagged passages",
        "Paper Checker flags passages that meet the active detector’s review cutoff. Passage scores do not provide separate predictions for sentences.",
      ],
      [
        "Writing quality",
        "Gemini scores each rubric category from 0 to 100: 0–39 needs substantial revision, 40–59 developing, 60–79 competent, 80–89 strong, and 90–100 excellent. The overall score is the mean of the rubric categories.",
      ],
      [
        "Interpretation",
        "Estimates vary by provider, document and writing style. Human writing can be flagged and AI writing can be missed. Do not use detection scores as the sole basis for academic penalties.",
      ],
    ],
  },
  faq: {
    title: "Frequently asked questions",
    intro: "Answers about analysis, document formats and privacy.",
    sections: faq,
  },
  privacy: {
    title: "Privacy policy",
    intro: "How Paper Checker handles uploaded work and analysis history.",
    sections: [
      [
        "Files and extracted text",
        "Original files stay in browser memory. Detection runs locally. With your consent, extracted text is sent to Google Gemini for writing analysis, subject to its service terms.",
      ],
      [
        "Saved reports",
        "Paper Checker stores metadata and numerical results by default. When you enable text retention, reports can also include extracted text, quotations and detailed feedback.",
      ],
      [
        "Account and deletion",
        "Clerk manages your account and sessions. You can delete any scan, clear history or request account deletion from settings.",
      ],
    ],
  },
  terms: {
    title: "Terms of service",
    intro: "Terms for using Paper Checker to review academic writing.",
    sections: [
      [
        "Permission to submit",
        "Submit content you have the right to share with Paper Checker and its analysis providers.",
      ],
      [
        "Review generated feedback",
        "Scores and suggestions are estimates and may contain errors. Use qualified human judgment for any consequential decision.",
      ],
      [
        "Service availability",
        "Analysis depends on provider availability and quota. Paper Checker does not guarantee availability or a particular result.",
      ],
    ],
  },
};

import Link from "next/link";
import {
  ScanLine,
  PenLine,
  FileText,
  ShieldCheck,
  UploadCloud,
  ClipboardCheck,
  Layers3,
  LockKeyhole,
  Check,
  GraduationCap,
} from "lucide-react";
import { Header, Footer } from "@/components/public-shell";
import { Button } from "@/components/ui/button";
import { Preview } from "@/components/preview";
import { faq, pages } from "@/lib/public-content";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <section className="hero">
          <div className="container">
            <span className="eyebrow">
              <GraduationCap size={17} /> Academic writing intelligence
            </span>
            <h1>
              Understand Your Writing.
              <br />
              <em>Verify Its Authenticity.</em>
            </h1>
            <p className="lede">
              Review AI detection signals and get actionable academic writing
              feedback in one private workspace.
            </p>
            <div className="hero-actions">
              <Button asChild>
                <Link href="/analyze">Analyze Your Document</Link>
              </Button>
              <Button asChild variant="outline">
                <a href="#how-it-works">See how it works</a>
              </Button>
            </div>
            <Preview />
          </div>
        </section>
        <section className="formats">
          <div className="container formats-inner">
            <span>Supported formats</span>
            {["PDF", "DOCX", "TXT", "Pasted text"].map((format) => (
              <span className="format" key={format}>
                <FileText size={17} />
                {format}
              </span>
            ))}
          </div>
        </section>
        <section id="features" className="container section">
          <div className="section-heading">
            <span className="eyebrow">The analysis</span>
            <h2>Two perspectives on your writing.</h2>
            <p>Review detection signals and writing feedback side by side.</p>
          </div>
          <div className="feature-grid">
            <article className="feature">
              <div className="feature-icon">
                <ScanLine size={23} />
              </div>
              <h3>AI writing detection</h3>
              <p>
                Review the browser-generated estimate and see which passages
                contributed to the review.
              </p>
              <ul>
                <li>
                  <Check size={16} /> Passage-level detection estimates
                </li>
                <li>
                  <Check size={16} /> Highlighted passages in context
                </li>
                <li>
                  <Check size={16} /> Published scoring methodology
                </li>
              </ul>
              <a href="#methodology">Read the methodology</a>
            </article>
            <article className="feature">
              <div className="feature-icon">
                <PenLine size={23} />
              </div>
              <h3>Academic writing feedback</h3>
              <p>
                See how your draft reads and find specific revisions to improve
                your argument and style.
              </p>
              <ul>
                <li>
                  <Check size={16} /> Grammar, clarity and academic tone
                </li>
                <li>
                  <Check size={16} /> Rubric scores across eight categories
                </li>
                <li>
                  <Check size={16} /> Suggested revisions with explanations
                </li>
              </ul>
              <a href="#how-it-works">See how it works</a>
            </article>
          </div>
        </section>
        <section id="how-it-works" className="soft-section">
          <div className="container section">
            <div className="section-heading">
              <span className="eyebrow">Workflow</span>
              <h2>From draft to feedback.</h2>
            </div>
            <div className="steps">
              {[
                [
                  UploadCloud,
                  "Add your document",
                  "Upload a PDF, DOCX or TXT file, or paste your text.",
                ],
                [
                  Layers3,
                  "Run one analysis",
                  "Paper Checker checks for AI writing and evaluates academic quality together.",
                ],
                [
                  ClipboardCheck,
                  "Review and revise",
                  "Explore highlighted passages, compare rubric scores and export your report.",
                ],
              ].map(([Icon, title, body]) => {
                const StepIcon = Icon as typeof UploadCloud;
                return (
                  <article key={String(title)}>
                    <div className="feature-icon">
                      <StepIcon size={23} />
                    </div>
                    <h3>{String(title)}</h3>
                    <p>{String(body)}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
        <section className="container section">
          <div className="privacy-panel">
            <div className="feature-icon">
              <LockKeyhole size={24} />
            </div>
            <div>
              <h2>Your files stay in your browser.</h2>
              <p>
                AI detection runs in your browser. With your consent, Paper
                Checker sends extracted text to Gemini for writing feedback. You
                control what is saved in your history.
              </p>
              <Link href="/privacy">Read the privacy policy</Link>
            </div>
            <ShieldCheck
              className="privacy-decoration"
              size={140}
              strokeWidth={0.65}
            />
          </div>
        </section>
        <section
          id="methodology"
          className="container section methodology-section"
        >
          <div className="section-heading">
            <h2>{pages.methodology.title}</h2>
            <p>{pages.methodology.intro}</p>
          </div>
          <div className="feature-grid">
            {pages.methodology.sections.map(([title, body]) => (
              <article className="feature" key={title}>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="faq" className="container section faq-section">
          <div className="section-heading">
            <span className="eyebrow">FAQ</span>
            <h2>Common questions</h2>
          </div>
          {faq.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </section>
        <section className="bottom-cta">
          <div className="container">
            <h2>Bring your next draft into focus.</h2>
            <Button asChild>
              <Link href="/analyze">Analyze Your Document</Link>
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

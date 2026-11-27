"use client";
import { useState } from "react";
import {
  FileText,
  Check,
  ScanLine,
  PenLine,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  Minus,
  PanelTop,
} from "lucide-react";
import { motion } from "motion/react";
const descriptions = [
  "An illustrative report for a sample paper.",
  "Passage-level scores help you locate passages worth reviewing.",
  "Writing feedback is organized by issue and severity.",
];
export function Preview() {
  const [tab, setTab] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  return (
    <motion.div
      className="preview"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
    >
      <div className="preview-bar">
        <div className="preview-name">
          <FileText size={16} /> research-notes.pdf
        </div>
        <span className="sample-tag">Illustrative sample</span>
      </div>
      <div className="preview-body">
        <div className="preview-reader">
          <div className="preview-tools">
            <PanelTop size={15} />
            <span>Page {page} of 2</span>
            <button
              aria-label="Previous sample page"
              disabled={page === 1}
              onClick={() => setPage(1)}
            >
              <ChevronLeft size={15} />
            </button>
            <button
              aria-label="Next sample page"
              disabled={page === 2}
              onClick={() => setPage(2)}
            >
              <ChevronRight size={15} />
            </button>
            <button
              aria-label="Zoom out"
              disabled={zoom <= 0.9}
              onClick={() => setZoom(0.9)}
            >
              <Minus size={15} />
            </button>
            <button
              aria-label="Zoom in"
              disabled={zoom >= 1.1}
              onClick={() => setZoom(1.1)}
            >
              <ZoomIn size={15} />
            </button>
          </div>
          <div className="sample-paper" style={{ fontSize: 13 * zoom }}>
            <small>RESEARCH NOTES</small>
            <h2>
              {page === 1
                ? "Urban green space and public health"
                : "Discussion and next steps"}
            </h2>
            <p>
              {page === 1
                ? "Access to urban parks has long been associated with better community health outcomes. This review examines how proximity and design influence everyday use."
                : "Community participation can inform the placement and maintenance of public green spaces."}
            </p>
            <p>
              <mark className={tab === 2 ? "sample-amber" : "sample-blue"}>
                {page === 1
                  ? "These findings underscore the importance of integrating green infrastructure into urban planning."
                  : "Additional research could examine differences between neighborhoods over time."}
              </mark>
            </p>
            <p>
              Several factors may influence these results, including
              walkability, neighborhood demographics and the availability of
              public transit.
            </p>
          </div>
        </div>
        <div className="preview-results">
          <div className="preview-tabs">
            {["Overview", "AI detection", "Writing"].map((name, i) => (
              <button
                aria-pressed={tab === i}
                key={name}
                onClick={() => setTab(i)}
              >
                {name}
              </button>
            ))}
          </div>
          <p className="sample-description">{descriptions[tab]}</p>
          <div className="preview-scores">
            {tab !== 2 && (
              <div>
                <ScanLine size={17} />
                <strong>18%</strong>
                <span>AI detection</span>
              </div>
            )}
            {tab !== 1 && (
              <div>
                <PenLine size={17} />
                <strong>
                  86<span>/100</span>
                </strong>
                <span>Writing quality</span>
              </div>
            )}
          </div>
          <div className="sample-complete">
            <Check size={15} /> Sample analysis complete
          </div>
        </div>
      </div>
    </motion.div>
  );
}

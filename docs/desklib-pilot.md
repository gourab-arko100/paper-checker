# Desklib INT8 local pilot

The local package uses the pinned INT8 export of Desklib v1.01 for new scans. It runs with ONNX Runtime Web 1.31.1 using WASM in a dedicated worker. The first analysis needs a network connection to download the model, tokenizer and runtime. The 476,838,170-byte weights are cached in the origin-private filesystem. Keep the same browser profile and local origin to reuse that cache.

The ONNX model accepts INT64 input IDs and attention masks and returns one logit. The worker applies sigmoid once per passage and averages the scores weighted by eligible UTF-16 length. Each passage fits the pilot's 512-token cap, including special tokens. There is no right padding in the pilot's variable-length inputs. It runs one passage at a time, disables the runtime's optional CPU memory arena and memory pattern, and releases the session when finished. Desklib uses the 0.15 experimental review cutoff for the document and passage highlights. Detection scores do not measure the share of AI-written text.

The production deployment was not updated. The app uses the existing credentials and database schema. Historical reports retain their original detector results. To inspect a previously analyzed document with Desklib, open development diagnostics from its report after reattaching the original, then select **Auto**. Results from the diagnostics panel stay in memory.

[Desklib model](https://huggingface.co/desklib/ai-text-detector-v1.01) · [Pinned MIT-licensed ONNX export](https://huggingface.co/ns1703/desklib-ai-text-detector-onnx/tree/c70d913faedf75bd47f0dca342f43f1165ee9595)

## Full-paper browser and native check

The browser harness used the application's PDF extractor and detector worker in Chromium 156 on Linux. It served the pinned model and runtime files locally to isolate inference and caching from internet speed. Native ONNX Runtime 1.32.0 used the same INT8 file and the same inputs produced by the JavaScript tokenizer. A separate Python tokenizer check compared token IDs and attention masks on the same passages. The model weights matched SHA-256 `43f000b3d291d9124c59e92533cc76d55bbebc40ea4019ebc6ca8f0795acf238`.

| Paper | Pages | Included UTF-16 units | Passages | Browser score | Native score | Browser detect time | Native infer time | Cutoff result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| [Neural Machine Translation by Jointly Learning to Align and Translate](https://arxiv.org/abs/1409.0473) | 15 | 32,259 | 15 | 0.20640325 | 0.20640311 | 397 s | 107 s | Flagged |
| [Attention Is All You Need](https://arxiv.org/abs/1706.03762) | 15 | 30,330 | 14 | 0.09960457 | 0.09960446 | 316 s | 94 s | Below cutoff |

Translation excluded sections marked references. Attention excluded sections marked references. Every scored passage had overlapping PDF text boxes. The native runner verified the UTF-16 span lengths and the JavaScript tokenizer counts on every passage.

Translation differed with independent Python tokenization on passage 10 (513 Python tokens, 512 JavaScript tokens). The native and web inference comparison uses the same JavaScript inputs. It does not imply end-to-end parity across tokenizer implementations.

The maximum browser/native difference was 5.7e-06 on a raw logit, 6.4e-07 on a passage score, and 1.5e-07 on a document score. Both cutoff decisions matched.

One weights request served two separate workers in the same Chromium profile. Total Chromium subprocess RSS peaked around 2.74 GiB, from a 0.42 GiB starting point. RSS sums can count shared pages more than once. Browser timing includes startup and, on the first run, transfer from the local fixture server. Native timing excludes session startup. Other checks ran alongside the benchmark, so these times are indicative.

A separate browser smoke fixture verified DOCX extraction and that student information and references were excluded while the highlight slice matched the source text. The application’s automated tests also cover cover-page and contents exclusions.

At the requested 0.15 cutoff, 1 of these two human-authored references were flagged. Keep this cutoff experimental. These papers check whole-document behavior and inference parity. A larger labeled set with human, generated and mixed full papers would be needed to estimate accuracy.

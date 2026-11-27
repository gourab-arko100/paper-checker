import { notFound } from "next/navigation";
import { pages } from "@/lib/public-content";
import { Header, Footer } from "@/components/public-shell";
const standalonePages = ["about", "privacy", "terms"];
export function generateStaticParams() {
  return standalonePages.map((info) => ({ info }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ info: string }>;
}) {
  return { title: pages[(await params).info]?.title };
}
export default async function Info({
  params,
}: {
  params: Promise<{ info: string }>;
}) {
  const key = (await params).info;
  if (!standalonePages.includes(key)) notFound();
  const page = pages[key];
  return (
    <>
      <Header />
      <main className="container info">
        <h1>{page.title}</h1>
        <p className="lede">{page.intro}</p>
        <div className="info-sections">
          {page.sections.map(([title, body]) => (
            <section key={title}>
              <h2>{title}</h2>
              <p>{body}</p>
            </section>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}

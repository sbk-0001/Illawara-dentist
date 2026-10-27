import { ChatWidget, type ClinicUIMessage } from "@/chat";
import { getKnowledgeIndex } from "@/chat/server/index-store";
import styles from "./page.module.css";

function arabicFixture(): ClinicUIMessage[] {
  const index = getKnowledgeIndex();
  const clinic = index.contacts.shellharbour;
  const source = index.pages.find((page) => page.clinic === "shellharbour" && /contact/i.test(page.title))
    || index.pages.find((page) => page.clinic === "shellharbour");
  const hours = clinic.hours || "the hours published on the Shellharbour Dentists website";
  return [
    {
      id: "fixture-user",
      role: "user",
      parts: [{ type: "text", text: "ما هي ساعات العمل يوم السبت في شيلهاربر؟" }],
    },
    {
      id: "fixture-assistant",
      role: "assistant",
      metadata: {
        language: "ar",
        dir: "rtl",
        fallback: false,
        sources: source ? [{ title: source.title, url: source.url, clinic: "shellharbour" }] : [],
      },
      parts: [
        {
          type: "text",
          text: `حسب الصفحات المنشورة لشيلهاربر دنتستس، ساعات العمل هي: ${hours}. للحجز أو السؤال اتصلوا على ${clinic.phone} أو راسلوا ${clinic.email}.`,
        },
      ],
    },
  ];
}

export default async function Home({ searchParams }: { searchParams: Promise<{ fixture?: string }> }) {
  const params = await searchParams;
  const fixture = params.fixture === "arabic" ? arabicFixture() : undefined;
  return (
    <main className={styles.page}>
      <div className={styles.bar}>
        <span>Illawarra Dentists</span>
        <span>Woonona · Dapto · Shellharbour</span>
      </div>
      <section className={styles.main}>
        <p className={styles.eyebrow}>Homepage preview</p>
        <h1 className={styles.heading}>
          The clinic site
          <br />
          <span className={styles.script}>will live here.</span>
        </h1>
        <p className={styles.copy}>
          This page is only a placeholder in the brand colours so the chat widget can be previewed. It is not the new Illawarra Dentists homepage.
        </p>
        <p className={`${styles.copy} ${styles.note}`}>
          The widget floats at the bottom right. It answers from the public pages of the three clinics, in the language of the question.
        </p>
      </section>
      <ChatWidget defaultOpen={Boolean(fixture)} initialMessages={fixture} />
    </main>
  );
}

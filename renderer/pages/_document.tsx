import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @font-face {
                font-family: 'Silkscreen';
                font-style: normal;
                font-weight: 400;
                font-display: block;
                src: url('/fonts/silkscreen-regular.woff2') format('woff2');
              }
              @font-face {
                font-family: 'Silkscreen';
                font-style: normal;
                font-weight: 700;
                font-display: block;
                src: url('/fonts/silkscreen-bold.woff2') format('woff2');
              }
              :root {
                --font-pixel: 'Silkscreen', 'JetBrains Mono', monospace;
                --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
              }
              *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
              body { background: #f4e4c1; color: #5a3e2b; font-family: var(--font-mono); }
              ::-webkit-scrollbar { width: 8px; height: 8px; }
              ::-webkit-scrollbar-track { background: #ecd9b0; }
              ::-webkit-scrollbar-thumb { background: #b08d5a; border: 1px solid #5a3e2b; border-radius: 0; }
              button { cursor: pointer; font-family: inherit; }
              input, textarea { font-family: inherit; }
            `,
          }}
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

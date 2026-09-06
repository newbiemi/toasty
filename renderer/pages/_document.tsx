import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @font-face {
                font-family: 'Plus Jakarta Sans';
                font-style: normal;
                font-weight: 400;
                font-display: block;
                src: url('/fonts/plus-jakarta-sans-regular.ttf') format('truetype');
              }
              /* Registered under its own family name, not as a 600 weight of the
                 family above, so --font-pixel can pick it up without every call
                 site that uses that var needing an explicit fontWeight. */
              @font-face {
                font-family: 'Plus Jakarta Sans SemiBold';
                font-style: normal;
                font-weight: 400;
                font-display: block;
                src: url('/fonts/plus-jakarta-sans-semibold.ttf') format('truetype');
              }
              :root {
                /* Names are historical (Silkscreen's old pixel-font role) — kept so
                   every window's inline styles didn't need touching for this swap.
                   --font-pixel is still "the label/header weight", --font-mono is
                   still "the body weight". */
                --font-pixel: 'Plus Jakarta Sans SemiBold', 'Plus Jakarta Sans', sans-serif;
                --font-mono: 'Plus Jakarta Sans', sans-serif;
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

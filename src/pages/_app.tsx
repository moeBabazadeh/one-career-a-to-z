import type { AppProps } from "next/app";
import NextHead from "next/head";
import { useRouter } from "next/router";

export default function App({ Component, pageProps }: AppProps) {
  const { asPath } = useRouter();

  return (
    <>
      <NextHead>
        <meta charSet="utf-8" />
        <meta httpEquiv="Content-Type" content="text/html; charset=utf-8" />
        <meta name="robots" content="index, follow" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <meta name="theme-color" content="#64ffda" />
        <meta name="language" content="English" />

        <meta property="og:locale" content="en_GB" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Mohammad Babazadeh" />
        <meta
          property="og:url"
          content={`${process.env.NEXT_PUBLIC_URL}${asPath}`}
        />
        <meta property="og:image:width" content="300" />
        <meta property="og:image:height" content="300" />
        <meta
          property="og:image"
          content={process.env.NEXT_PUBLIC_URL + "/assets/icons/og-300x300.png"}
        />
        <meta property="og:ttl" content="604800" />
        <meta name="twitter:card" content="summary_large_image" />

        <link
          rel="icon"
          href="/assets/icons/favicon-32x32.png"
          type="image/png"
        />
        <link
          rel="manifest"
          href="/manifest.webmanifest"
          crossOrigin="anonymous"
        />
        <link
          rel="apple-touch-icon"
          sizes="48x48"
          href="/assets/icons/icon-48x48.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="72x72"
          href="/assets/icons/icon-72x72.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="96x96"
          href="/assets/icons/icon-96x96.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="144x144"
          href="/assets/icons/icon-144x144.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/assets/icons/icon-180x180.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="192x192"
          href="/assets/icons/icon-192x192.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="256x256"
          href="/assets/icons/icon-256x256.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="384x384"
          href="/assets/icons/icon-384x384.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="512x512"
          href="/assets/icons/icon-512x512.png"
        />
      </NextHead>

      <Component {...pageProps} />
    </>
  );
}

/* Medium integration
 *
 * Pulls your posts live from your Medium RSS feed (full HTML content) so there
 * is nothing to author or commit on this site. Medium's feed has no CORS
 * headers, so it is read through the rss2json proxy.
 *
 * >>> Set your Medium username below (without the @). <<<
 */
(function () {
  const MEDIUM_USER = "niranjan-rao";

  const PROFILE_URL = `https://medium.com/@${MEDIUM_USER}`;
  const FEED_URL = `https://medium.com/feed/@${MEDIUM_USER}`;
  const API_URL =
    "https://api.rss2json.com/v1/api.json?rss_url=" + encodeURIComponent(FEED_URL);
  const CACHE_KEY = "medium-feed-v1";
  const CACHE_MS = 15 * 60 * 1000;

  function textOf(html) {
    const doc = new DOMParser().parseFromString(html || "", "text/html");
    return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  }

  function postId(link) {
    try {
      return new URL(link).pathname.split("/").filter(Boolean).pop();
    } catch (e) {
      return "";
    }
  }

  function firstImage(html) {
    const doc = new DOMParser().parseFromString(html || "", "text/html");
    const img = [...doc.querySelectorAll("img")].find(
      (i) => !/medium\.com\/_\/stat/.test(i.getAttribute("src") || "")
    );
    return img ? img.getAttribute("src") : "";
  }

  function normalize(item) {
    const content = item.content || item.description || "";
    const text = textOf(content);
    const words = text ? text.split(" ").length : 0;
    return {
      id: postId(item.link),
      title: item.title,
      link: (item.link || "").split("?")[0],
      date: (item.pubDate || "").replace(" ", "T") + "Z",
      thumbnail: item.thumbnail || firstImage(content),
      categories: item.categories || [],
      readMins: Math.max(1, Math.round(words / 200)),
      excerpt: text.length > 220 ? text.slice(0, 220).replace(/\s+\S*$/, "") + "…" : text,
      content,
    };
  }

  async function loadPosts() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY));
      if (cached && Date.now() - cached.t < CACHE_MS) return cached.posts;
    } catch (e) {}

    const res = await fetch(API_URL);
    if (!res.ok) throw new Error("Medium feed request failed");
    const data = await res.json();
    if (data.status !== "ok") throw new Error(data.message || "Medium feed error");

    const posts = data.items
      .map(normalize)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), posts }));
    } catch (e) {}
    return posts;
  }

  /* Medium content is third-party HTML, so strip anything executable and the
     bits of the feed that are noise (tracking pixel, duplicate title). */
  function sanitize(html, title) {
    const doc = new DOMParser().parseFromString(html || "", "text/html");
    doc
      .querySelectorAll("script, style, iframe, object, embed, form, link, meta, base")
      .forEach((n) => n.remove());

    doc.querySelectorAll("img").forEach((img) => {
      if (/medium\.com\/_\/stat/.test(img.getAttribute("src") || "")) {
        img.remove();
      } else {
        img.setAttribute("loading", "lazy");
        img.removeAttribute("width");
        img.removeAttribute("height");
      }
    });

    doc.querySelectorAll("*").forEach((el) => {
      [...el.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        const val = attr.value.trim().toLowerCase();
        if (
          name.startsWith("on") ||
          name === "style" ||
          ((name === "href" || name === "src") && val.startsWith("javascript:"))
        ) {
          el.removeAttribute(attr.name);
        }
      });
    });

    doc.querySelectorAll("a[href]").forEach((a) => {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    });

    const h1 = doc.querySelector("h1");
    if (h1 && title && textOf(h1.innerHTML) === title.trim()) h1.remove();

    doc.querySelectorAll("figure").forEach((f) => {
      if (!f.querySelector("img, video, picture")) f.remove();
    });

    return doc.body.innerHTML;
  }

  function formatDate(iso, month) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: month || "short",
      day: "numeric",
    });
  }

  window.Medium = { PROFILE_URL, loadPosts, sanitize, formatDate };
})();

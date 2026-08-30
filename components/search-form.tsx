export function SearchForm({
  defaultQuery = "",
  defaultType,
  defaultOrigin,
}: {
  defaultQuery?: string;
  defaultType?: string;
  defaultOrigin?: string;
}) {
  return (
    <form action="/search" className="w-full">
      {defaultType ? (
        <input type="hidden" name="type" value={defaultType} />
      ) : null}
      {defaultOrigin ? (
        <input type="hidden" name="origin" value={defaultOrigin} />
      ) : null}
      <label className="sr-only" htmlFor="q">
        Search the library
      </label>
      <input
        id="q"
        name="q"
        type="search"
        defaultValue={defaultQuery}
        placeholder="Ask the library — papers, blogs, tweets, anything…"
        className="w-full border-0 border-b border-rule bg-transparent pb-3 text-2xl font-medium tracking-tight text-ink outline-none placeholder:text-muted/70 focus:border-terracotta"
      />
    </form>
  );
}

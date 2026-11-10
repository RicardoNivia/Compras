// Renderizador de Markdown minimalista y seguro: construye elementos React
// directamente (nunca dangerouslySetInnerHTML), así que no hay forma de que
// una respuesta del modelo inyecte HTML/script en la página.

let keySeq = 0;
function nextKey(prefix) {
  keySeq += 1;
  return `${prefix}-${keySeq}`;
}

function parseInline(text) {
  const nodes = [];
  const re = /(\*\*(.+?)\*\*|`([^`]+)`|\*(.+?)\*)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) nodes.push(<strong key={nextKey("b")}>{m[2]}</strong>);
    else if (m[3] !== undefined) nodes.push(<code key={nextKey("c")} className="mono">{m[3]}</code>);
    else if (m[4] !== undefined) nodes.push(<em key={nextKey("i")}>{m[4]}</em>);
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function isTableSeparator(line) {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-");
}

function parseTable(lines) {
  const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const header = cells(lines[0]);
  const rows = lines.slice(2).map(cells);
  return (
    <div className="chat-table-wrap" key={nextKey("table")}>
      <table className="chat-table">
        <thead>
          <tr>{header.map((h, i) => <th key={i}>{parseInline(h)}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>{row.map((c, ci) => <td key={ci}>{parseInline(c)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function parseBlock(block) {
  const lines = block.split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) return null;

  // Un encabezado puede llegar seguido de más líneas en el mismo bloque (el
  // modelo no siempre deja una línea en blanco después) — se reconoce igual
  // aunque no sea la única línea del bloque, y el resto se procesa aparte.
  const headingMatch = lines[0].match(/^(#{1,6})\s+(.*)$/);
  if (headingMatch) {
    const level = headingMatch[1].length;
    const Tag = `h${Math.min(level + 3, 6)}`;
    const heading = <Tag key={nextKey("h")}>{parseInline(headingMatch[2])}</Tag>;
    const rest = lines.slice(1).join("\n");
    if (!rest) return heading;
    return (
      <div key={nextKey("hwrap")} className="chat-heading-block">
        {heading}
        {parseBlock(rest)}
      </div>
    );
  }

  if (lines.length >= 2 && lines[0].includes("|") && isTableSeparator(lines[1])) {
    return parseTable(lines);
  }

  const isBullet = lines.every((l) => /^\s*[-*]\s+/.test(l));
  if (isBullet) {
    return (
      <ul key={nextKey("ul")}>
        {lines.map((l, i) => <li key={i}>{parseInline(l.replace(/^\s*[-*]\s+/, ""))}</li>)}
      </ul>
    );
  }

  const isNumbered = lines.every((l) => /^\s*\d+[.)]\s+/.test(l));
  if (isNumbered) {
    return (
      <ol key={nextKey("ol")}>
        {lines.map((l, i) => <li key={i}>{parseInline(l.replace(/^\s*\d+[.)]\s+/, ""))}</li>)}
      </ol>
    );
  }

  return <p key={nextKey("p")}>{parseInline(lines.join(" "))}</p>;
}

function parseMarkdownBlocks(text) {
  return text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map(parseBlock);
}

// Divide el texto en segmentos: bloques ```chart``` y ```fotos``` (devueltos aparte para que
// el llamador los renderice con ChartFromSpec / FotosEnChat) y el resto como nodos Markdown.
export function splitChartBlocks(text) {
  const parts = [];
  const re = /```(chart|fotos)\s*([\s\S]*?)```/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ type: "markdown", text: text.slice(last, m.index) });
    let spec = null;
    try {
      spec = JSON.parse(m[2]);
    } catch {
      // JSON inválido: se ignora el bloque y se muestra como texto plano.
      parts.push({ type: "markdown", text: "```\n" + m[2].trim() + "\n```" });
      last = re.lastIndex;
      continue;
    }
    parts.push({ type: m[1], spec });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ type: "markdown", text: text.slice(last) });
  return parts;
}

export function renderMarkdown(text) {
  return parseMarkdownBlocks(text || "");
}

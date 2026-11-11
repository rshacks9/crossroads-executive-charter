"""Tiny markdown -> HTML for vAMSYS page source (h1-h3, p, ul, ol, tables, **b**, *i*)."""
import html, re, sys

def inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<!\*)\*(?!\*)(.+?)\*", r"<em>\1</em>", s)
    return s

def convert(text, drop_h1=True):
    out, lines, i = [], text.splitlines(), 0
    while i < len(lines):
        l = lines[i].rstrip()
        if not l: i += 1; continue
        m = re.match(r"^(#{1,3}) (.*)", l)
        if m:
            lvl = len(m.group(1))
            if not (lvl == 1 and drop_h1): out.append(f"<h{lvl}>{inline(m.group(2))}</h{lvl}>")
            i += 1; continue
        if l.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r"-+", c) for c in cells): rows.append(cells)
                i += 1
            t = "<table><tbody>" + "<tr>" + "".join(f"<th>{inline(c)}</th>" for c in rows[0]) + "</tr>"
            for r in rows[1:]: t += "<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>"
            out.append(t + "</tbody></table>"); continue
        if re.match(r"^(- |\d+\. )", l):
            tag = "ul" if l.startswith("- ") else "ol"; items = []
            while i < len(lines) and re.match(r"^(- |\d+\. )", lines[i]):
                items.append(re.sub(r"^(- |\d+\. )", "", lines[i].rstrip())); i += 1
            out.append(f"<{tag}>" + "".join(f"<li><p>{inline(x)}</p></li>" for x in items) + f"</{tag}>"); continue
        para = [l]; i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r"^(#|\||- |\d+\. )", lines[i]):
            para.append(lines[i].rstrip()); i += 1
        out.append("<p>" + inline(" ".join(para)) + "</p>")
    return "".join(out)

if __name__ == "__main__":
    src = sys.argv[1]; dst = sys.argv[2]
    open(dst, "w", encoding="utf-8").write(convert(open(src, encoding="utf-8-sig").read()))


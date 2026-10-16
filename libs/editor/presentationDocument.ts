import { designPageLinkIndex, normaliseDesignLink, type DesignPdfLink } from "./designLinks";
import { zipTextEntry, type ZipEntry } from "./zipArchive";
export const PRESENTATION_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
export const PRESENTATION_IMAGE_LIMIT = 256 * 1024 * 1024;
export interface PresentationSlide { index: number; title?: string; notes?: string; hidden?: boolean; links?: readonly DesignPdfLink[] }
const P = "http://schemas.openxmlformats.org/presentationml/2006/main", A = "http://schemas.openxmlformats.org/drawingml/2006/main", R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const xml = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ud800-\udfff\ufffe\uffff]/gu, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const header = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
type Relationship = { id: string; type: string; target: string; external?: boolean };
const relationships = (items: Relationship[]) => `${header}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(item => `<Relationship Id="${xml(item.id)}" Type="${R}/${item.type}" Target="${xml(item.target)}"${item.external ? ' TargetMode="External"' : ""}/>`).join("")}</Relationships>`;
const namespaces = `xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"`;
const group = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const colourMap = '<p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/>';
const inheritedColours = '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>';
const textParagraphs = (value: string) => value.replace(/\r\n?/g, "\n").split("\n").map(line => `<a:p><a:r><a:rPr lang="en-US"/><a:t xml:space="preserve">${xml(line)}</a:t></a:r><a:endParaRPr lang="en-US"/></a:p>`).join("");
const noteShape = (text: string) => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes"/><p:cNvSpPr txBox="1"/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="4343400"/><a:ext cx="5486400" cy="4114800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${textParagraphs(text)}</p:txBody></p:sp>`;

function theme(): string {
  const colours = { dk1: "000000", lt1: "FFFFFF", dk2: "202020", lt2: "F5F5F5", accent1: "0891B2", accent2: "7C3AED", accent3: "16A34A", accent4: "EA580C", accent5: "DB2777", accent6: "2563EB", hlink: "0000FF", folHlink: "800080" };
  const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  return `${header}<a:theme xmlns:a="${A}" name="Default"><a:themeElements><a:clrScheme name="Default">${Object.entries(colours).map(([key, value]) => `<a:${key}><a:srgbClr val="${value}"/></a:${key}>`).join("")}</a:clrScheme><a:fontScheme name="Default"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Default"><a:fillStyleLst>${fill.repeat(3)}</a:fillStyleLst><a:lnStyleLst>${[9525, 19050, 28575].map(width => `<a:ln w="${width}" cap="flat" cmpd="sng" algn="ctr">${fill}<a:prstDash val="solid"/></a:ln>`).join("")}</a:lnStyleLst><a:effectStyleLst>${'<a:effectStyle><a:effectLst/></a:effectStyle>'.repeat(3)}</a:effectStyleLst><a:bgFillStyleLst>${fill.repeat(3)}</a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;
}

export function presentationSlideSize(width: number, height: number) {
  if (![width, height].every(value => Number.isFinite(value) && value >= 64 && value <= 8192)) throw new Error("Choose a valid page size for the presentation");
  const unit = Math.max(914400 / Math.min(width, height), 9144000 / Math.max(width, height));
  const cx = Math.round(unit * width), cy = Math.round(unit * height);
  if (Math.max(cx, cy) > 51206400) throw new Error("This page aspect ratio is too wide or tall for PowerPoint. Use a ratio within 56:1");
  return { cx, cy };
}

/** Package metadata for image-backed slides; image entries are supplied by the export platform. */
export function presentationDocumentEntries(width: number, height: number, title: string, slides: readonly PresentationSlide[]): ZipEntry[] {
  if (slides.length < 1 || slides.length > 500 || slides.some(slide => !Number.isInteger(slide.index) || slide.index < 0 || slide.index >= 500) || new Set(slides.map(slide => slide.index)).size !== slides.length) throw new Error("Choose 1–500 valid design pages for the presentation");
  const { cx, cy } = presentationSlideSize(width, height);
  const parts: ZipEntry[] = [], overrides: { name: string; type: string }[] = [];
  const add = (name: string, text: string, type?: string) => { parts.push(zipTextEntry(name, text)); if (type) overrides.push({ name, type }); };
  const presentationType = (name: string) => `application/vnd.openxmlformats-officedocument.presentationml.${name}+xml`;
  const haveNotes = slides.some(slide => !!slide.notes);
  add('_rels/.rels', `${header}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  add('docProps/core.xml', `${header}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(title.slice(0, 500))}</dc:title></cp:coreProperties>`, 'application/vnd.openxmlformats-package.core-properties+xml');
  add('ppt/presentation.xml', `${header}<p:presentation ${namespaces}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster"/></p:sldMasterIdLst>${haveNotes ? '<p:notesMasterIdLst><p:notesMasterId r:id="rIdNotes"/></p:notesMasterIdLst>' : ""}<p:sldIdLst>${slides.map((_, index) => `<p:sldId id="${256 + index}" r:id="rIdSlide${index + 1}"/>`).join("")}</p:sldIdLst><p:sldSz cx="${cx}" cy="${cy}" type="custom"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle/></p:presentation>`, presentationType('presentation.main'));
  add('ppt/_rels/presentation.xml.rels', relationships([{ id: 'rIdMaster', type: 'slideMaster', target: 'slideMasters/slideMaster1.xml' }, { id: 'rIdProps', type: 'presProps', target: 'presProps.xml' }, ...(haveNotes ? [{ id: 'rIdNotes', type: 'notesMaster', target: 'notesMasters/notesMaster1.xml' }] : []), ...slides.map((_, index) => ({ id: `rIdSlide${index + 1}`, type: 'slide', target: `slides/slide${index + 1}.xml` }))]));
  add('ppt/presProps.xml', `${header}<p:presentationPr ${namespaces}/>`, presentationType('presProps'));
  add('ppt/theme/theme1.xml', theme(), 'application/vnd.openxmlformats-officedocument.theme+xml');
  add('ppt/slideMasters/slideMaster1.xml', `${header}<p:sldMaster ${namespaces}><p:cSld><p:spTree>${group}</p:spTree></p:cSld>${colourMap}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rIdLayout"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`, presentationType('slideMaster'));
  add('ppt/slideMasters/_rels/slideMaster1.xml.rels', relationships([{ id: 'rIdLayout', type: 'slideLayout', target: '../slideLayouts/slideLayout1.xml' }, { id: 'rIdTheme', type: 'theme', target: '../theme/theme1.xml' }]));
  add('ppt/slideLayouts/slideLayout1.xml', `${header}<p:sldLayout ${namespaces} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${group}</p:spTree></p:cSld>${inheritedColours}</p:sldLayout>`, presentationType('slideLayout'));
  add('ppt/slideLayouts/_rels/slideLayout1.xml.rels', relationships([{ id: 'rIdMaster', type: 'slideMaster', target: '../slideMasters/slideMaster1.xml' }]));
  if (haveNotes) {
    add('ppt/notesMasters/notesMaster1.xml', `${header}<p:notesMaster ${namespaces}><p:cSld><p:spTree>${group}${noteShape("")}</p:spTree></p:cSld>${colourMap}<p:notesStyle/></p:notesMaster>`, presentationType('notesMaster'));
    add('ppt/notesMasters/_rels/notesMaster1.xml.rels', relationships([{ id: 'rIdTheme', type: 'theme', target: '../theme/theme1.xml' }]));
  }
  const positions = new Map(slides.map((slide, index) => [slide.index, index + 1]));
  slides.forEach((slide, index) => {
    const number = index + 1, name = (slide.title || `Page ${slide.index + 1}`).slice(0, 200), rels: Relationship[] = [{ id: 'rIdLayout', type: 'slideLayout', target: '../slideLayouts/slideLayout1.xml' }, { id: 'rIdImage', type: 'image', target: `../media/image${number}.jpg` }];
    let hotspots = "";
    for (const [linkIndex, link] of (slide.links ?? []).slice(0, 1000).entries()) {
      if (![link.x, link.y, link.width, link.height].every(Number.isFinite) || link.width <= 0 || link.height <= 0) continue;
      const url = normaliseDesignLink(link.url); if (!url) continue;
      const page = designPageLinkIndex(url), target = page === null ? null : positions.get(page); if (page !== null && target === undefined) continue;
      const id = `rIdLink${linkIndex + 1}`;
      rels.push({ id, type: page === null ? 'hyperlink' : 'slide', target: page === null ? url : `slide${target}.xml`, external: page === null });
      const x = Math.round(Math.max(0, Math.min(1, link.x)) * cx), y = Math.round(Math.max(0, Math.min(1, link.y)) * cy), w = Math.round(Math.min(1 - x / cx, link.width) * cx), h = Math.round(Math.min(1 - y / cy, link.height) * cy);
      if (w < 1 || h < 1) continue;
      hotspots += `<p:sp><p:nvSpPr><p:cNvPr id="${3 + linkIndex}" name="Link ${linkIndex + 1}"><a:hlinkClick r:id="${id}"${page === null ? '' : ' action="ppaction://hlinksldjump"'}/></p:cNvPr><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"><a:alpha val="0"/></a:srgbClr></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
    }
    if (slide.notes) rels.push({ id: 'rIdNotes', type: 'notesSlide', target: `../notesSlides/notesSlide${number}.xml` });
    add(`ppt/slides/slide${number}.xml`, `${header}<p:sld ${namespaces}${slide.hidden ? ' show="0"' : ''}><p:cSld name="${xml(name)}"><p:spTree>${group}<p:pic><p:nvPicPr><p:cNvPr id="2" name="${xml(name)}" descr="${xml(name)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdImage"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>${hotspots}</p:spTree></p:cSld>${inheritedColours}</p:sld>`, presentationType('slide'));
    add(`ppt/slides/_rels/slide${number}.xml.rels`, relationships(rels));
    if (slide.notes) {
      add(`ppt/notesSlides/notesSlide${number}.xml`, `${header}<p:notes ${namespaces}><p:cSld><p:spTree>${group}${noteShape(slide.notes.slice(0, 10000))}</p:spTree></p:cSld>${inheritedColours}</p:notes>`, presentationType('notesSlide'));
      add(`ppt/notesSlides/_rels/notesSlide${number}.xml.rels`, relationships([{ id: 'rIdMaster', type: 'notesMaster', target: '../notesMasters/notesMaster1.xml' }, { id: 'rIdSlide', type: 'slide', target: `../slides/slide${number}.xml` }]));
    }
  });
  add('[Content_Types].xml', `${header}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/>${overrides.map(item => `<Override PartName="/${item.name}" ContentType="${item.type}"/>`).join("")}</Types>`);
  return parts;
}

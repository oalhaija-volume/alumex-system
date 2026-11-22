#!/usr/bin/env python3
"""Regenerate the management-approved 2027 contract artwork from its source PDF.

Run from this repository with the existing offline PyMuPDF and Pillow tools:
    python3 scripts/generate-agreement-2027.py

Screen artwork retains the original PDF glyph outlines. Print artwork embeds
those same original font glyphs to keep seven-page signed PDFs under 3 MiB.
The original PDF and application/project data are never modified.
"""
from pathlib import Path
import fitz,json,re,hashlib,base64,io,xml.etree.ElementTree as ET
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'عقد اتفاق 2027.pdf'
OUTPUT=ROOT/'public/contracts/agreement-2027'
ARTIFACT=ROOT/'artifacts/contract-reference-20261122'
ARTIFACT.mkdir(parents=True,exist_ok=True)
OUTPUT.mkdir(parents=True,exist_ok=True)
PAGE_SIZE={'width':595.3200073242188,'height':841.9199829101562}

# All positions are PDF points from the supplied, unmodified management template.
def slot(key,rect,**extra):
 return {'key':key,'rect':rect,**extra}
fields={
 'header':[slot('contractNumber',[116.42,89.42,173.34,103.46])],
 '1':[
  slot('projectName',[58.34,132.86,465.69,144.5]),
  slot('contractNumber',[342.07,149.90,465.69,161.54]),
  slot('handoffDate',[58.34,149.90,209.44,161.54]),
  slot('contractDate',[342.07,167.06,465.69,178.82]),
  slot('siteConditionAtSigning',[58.34,167.06,209.44,178.82]),
  slot('projectDuration',[342.07,184.58,465.69,196.22]),
  slot('salesEngineerName',[58.34,184.58,209.44,196.22]),
  slot('customerClassification',[342.07,205.94,465.69,217.70]),
  slot('salesEngineerSignature',[58.34,199.14,209.44,224.50]),
  slot('cityArea',[337.27,270.05,464.73,281.69]),
  slot('consultantName',[57.38,270.05,204.52,281.69]),
  slot('ownerName',[337.27,286.61,464.73,298.25]),
  slot('consultantPhone',[57.38,286.61,204.52,298.25]),
  slot('ownerPhone',[337.27,305.57,464.73,317.21]),
  slot('contractValue',[57.38,303.29,204.52,319.49]),
  slot('contractorName',[337.27,324.53,464.73,336.17]),
  slot('advancePaymentPercent',[57.38,324.53,204.52,336.17]),
  slot('contractorPhone',[337.27,341.09,464.73,352.73]),
  slot('advancePaymentAmount',[57.38,341.09,204.52,352.73]),
  slot('owningEntityName',[337.27,357.65,464.73,369.29]),
  slot('advancePaymentDate',[57.38,357.65,204.52,369.29]),
  slot('projectInstructions',[53.88,482.35,465.82,493.99]),
  slot('agreedCommitments',[53.88,499.07,465.82,520.47]),
  slot('specialFollowUpNotes',[53.88,523.19,465.82,543.99]),
  slot('projectManagerName',[342.31,557.47,464.73,569.11]),
  slot('handoffReceiptDate',[52.92,557.47,234.89,569.11]),
  slot('projectEngineerName',[342.31,580.06,464.73,591.70]),
  slot('projectApprovalDate',[52.92,580.06,234.89,591.70]),
  slot('approvalSalesEngineerName',[397.51,632.82,462.81,646.46]),
  slot('approvalSalesManagerName',[313.03,632.82,386.71,646.46]),
  slot('approvalOperationsManagerName',[224.45,632.82,302.23,646.46]),
  slot('approvalProjectManagerName',[131.42,632.82,213.64,646.46]),
  slot('approvalProjectEngineerName',[55.68,632.82,120.62,646.46]),
  slot('approvalSalesEngineerSignature',[397.51,650.06,462.81,664.46]),
  slot('approvalSalesManagerSignature',[313.03,650.06,386.71,664.46]),
  slot('approvalOperationsManagerSignature',[224.45,650.06,302.23,664.46]),
  slot('approvalProjectManagerSignature',[131.42,650.06,213.64,664.46]),
  slot('approvalProjectEngineerSignature',[55.68,650.06,120.62,664.46]),
  slot('approvalSalesEngineerDate',[397.51,668.94,462.81,682.22]),
  slot('approvalSalesManagerDate',[313.03,668.94,386.71,682.22]),
  slot('approvalOperationsManagerDate',[224.45,668.94,302.23,682.22]),
  slot('approvalProjectManagerDate',[131.42,668.94,213.64,682.22]),
  slot('approvalProjectEngineerDate',[55.68,668.94,120.62,682.22]),
  slot('administrativeRecommendations',[54,686,478,704]),
 ],
 '2':[
  slot('firstPartyName',[441.22,128.90,506.31,142.94]),
  slot('executingEntityName',[88.70,128.90,175.64,142.94]),
  slot('projectAddress',[311.0,142.50,503.70,154.50]),
  slot('officialContacts',[144.62,153.20,424.12,168.47]),
  slot('contractWeekday',[412.15,239.70,450.07,252.66]),
  slot('contractDate',[308.47,239.70,368.36,252.66]),
  slot('contractAmount',[271.01,299.50,399.58,314.00]),
  slot('contractAmountWords',[124.46,299.50,183.93,314.00]),
 ],
 '6':[
  slot('deliveryWorkingDays',[360.19,129.40,370.28,141.00]),
  slot('deliveryWorkingDaysWords',[322.03,129.37,352.18,140.47]),
  slot('firstPartyName',[424.66,590.37,479.68,601.47]),
  slot('executingEntityName',[374.59,612.85,436.76,622.81]),
  slot('projectAddress',[325.40,622.80,506.20,635.10]),
  slot('officialContacts',[324.07,648.00,548.45,660.00]),
  slot('companyRepresentativeName',[136.10,638.00,225.95,650.10]),
  slot('companyRepresentativeRole',[133.70,650.50,227.16,661.50]),
  slot('companySignature',[90.5,678.5,268.0,725.5]),
  slot('clientSignature',[344.6,677.5,522.3,724.5]),
 ],
 '7':[]
}
# Annex phase columns: phase 1 is nearest the required appointment label (RTL).
for phase,(x0,x1) in enumerate([(316.8,375.5),(256.9,315.6),(197.1,255.8)]):
 for key,(y0,y1) in {'technicalMeetingDate':(394.0,410.2),'measurementReadyDate':(412.2,428.8),'installationReadyDate':(430.6,447.1)}.items():
  fields['7'].append(slot(f'phase-{phase}-{key}',[x0,y0,x1,y1]))
fields['7'] += [slot('technicalMeetingNotes',[76.5,394.0,194.0,410.2]),slot('measurementReadyNotes',[76.5,412.2,194.0,428.8]),slot('installationReadyNotes',[76.5,430.6,194.0,447.1])]

checkboxes={
 'projectType':{
  'project':[276.5,255.875,283.5,262.875],
  'commercial':[246.0,255.875,253.0,262.875],
  'residential':[206.625,255.875,213.625,262.875]
 },
 'samples':{
  'aluminium':[313.125,405.625,320.125,412.625],
  'roller':[262.375,405.625,269.375,412.625],
  'glass':[226.5,405.625,233.5,412.625],
  'curtainSection':[168.75,405.625,175.75,412.625]
 },
 'contents':{
  'roller':[321.625,432.375,328.625,439.375],
  'curtainWall':[288.875,432.375,295.875,439.375],
  'louver':[264.625,432.375,271.625,439.375],
  'skylight':[225.5,432.375,232.5,439.375],
  'hinged':[196.75,432.375,203.75,439.375],
  'sliding':[171.25,432.375,178.25,439.375]
 }
}

# Numeric price placeholders alone are replaced; product/specification text remains original.
model_names={
 3:[('alumex-16','ALUMEX 16'),('alumex-16-pro','ALUMEX 16 PRO'),('alumex-16-plus','ALUMEX 16 PLUS'),('alumex-4500','ALUMEX 4500'),('alumex-4500-pro','ALUMEX 4500 PRO'),('alumex-4500-louver','ALUMEX 4500 LOUVER'),('alumex-curtain-wall-cw60','ALUMEX CURTAIN WALL CW 60'),('alumex-skylight-cw60','ALUMEX SKYLIGHT CW 60'),('alumex-push-out','ALUMEX PUSH OUT'),('alumex-swing-door','ALUMEX SWING DOOR')],
 4:[('photo-cell-geze','ALUMEX PHOTO CELL DOOR GEZZE'),('photo-cell-ex','ALUMEX PHOTO CELL DOOR EX'),('the-address-as-a18','THE ADDRESS AS A18'),('the-address-as-a15','THE ADDRESS AS A15'),('the-address-ah650-660-688','THE ADDRESS AH 650 – 660 – 688'),('the-address-curtain-wall','THE ADDRESS CURTAIN WALL ACW 1200 – 1500 – 2800'),('tempered-glass-single','فرق زجاج مقسى سيكوريت للوح الواحد'),('tempered-glass-double','فرق زجاج مقسى سيكوريت للوحين'),('low-e-glass','LOW-E GLASS'),('mirror-glass','GLASS MIRROR'),('georgian-bar','GEORGIAN BAR'),('turn-and-tilt','TURN AND TILT - LAVAL'),('sub-frame','SUB FRAME OR COVER FRAME'),('arch','تقويس المنيوم وطبعة زجاج')]
}

def rect_union(chars):
 rect=fitz.Rect(chars[0]['bbox'])
 for char in chars[1:]:rect|=fitz.Rect(char['bbox'])
 return rect

def clear_text(page,rect):
 rect=fitz.Rect(rect)
 if rect.width>0.02 and rect.height>0.02:page.add_redact_annot(rect,fill=False,cross_out=False)

def inline_image_alpha(svg):
 # PDF logo soft masks become SVG masks. Inline their alpha pixels directly so
 # browser printing and SVG/PDF renderers all retain the original transparency.
 namespace='http://www.w3.org/2000/svg'
 href='{http://www.w3.org/1999/xlink}href'
 ET.register_namespace('',namespace)
 ET.register_namespace('xlink','http://www.w3.org/1999/xlink')
 tree=ET.fromstring(svg)
 masks={element.attrib['id']:element for element in tree.iter('{'+namespace+'}mask')}
 for group in tree.iter('{'+namespace+'}g'):
  match=re.fullmatch(r'url\(#([^)]*)\)',group.attrib.get('mask',''))
  if not match:continue
  mask=masks.get(match.group(1))
  if mask is None:raise ValueError('Missing source image mask')
  mask_image=mask.find('.//{'+namespace+'}image')
  image=group.find('.//{'+namespace+'}image')
  if mask_image is None or image is None:raise ValueError('Unexpected non-image source mask')
  rgba=Image.open(io.BytesIO(base64.b64decode(image.attrib[href].split(',',1)[1]))).convert('RGBA')
  alpha=Image.open(io.BytesIO(base64.b64decode(mask_image.attrib[href].split(',',1)[1]))).convert('L')
  rgba.putalpha(alpha)
  output=io.BytesIO();rgba.save(output,format='PNG')
  image.attrib[href]='data:image/png;base64,'+base64.b64encode(output.getvalue()).decode()
  del group.attrib['mask']
 for parent in tree.iter():
  for child in list(parent):
   if child.tag=='{'+namespace+'}mask':parent.remove(child)
 return ET.tostring(tree,encoding='unicode')

def sanitize_svg_glyphs(svg,rectangles,payment_rect=None):
 # Remove exact placeholder glyph uses, retaining all neighbouring static glyphs.
 # Text redaction in a PDF can also affect overlapping diacritics on another
 # line, so production SVGs are derived directly from the untouched source.
 namespace='http://www.w3.org/2000/svg'
 tree=ET.fromstring(svg)
 for parent in tree.iter():
  for child in list(parent):
   if child.tag!='{'+namespace+'}use':continue
   remove=child.attrib.get('fill','').lower()=='#5b9bd5'
   matrix=re.fullmatch(r'matrix\(([^)]*)\)',child.attrib.get('transform',''))
   if matrix:
    parts=[float(v) for v in re.split(r'[ ,]+',matrix.group(1))]
    if len(parts)==6:
     x,y=parts[4],parts[5]
     remove=remove or any(r[0]-.02<=x<=r[2]+.02 and r[1]-.02<=y<=r[3]+.02 for r in rectangles)
   if remove:parent.remove(child)
 if payment_rect:
  x0,y0,x1,y1=payment_rect
  ET.SubElement(tree,'{'+namespace+'}rect',{'x':str(x0),'y':str(y0),'width':str(x1-x0),'height':str(y1-y0),'fill':'#ffffff'})
 return ET.tostring(tree,encoding='unicode')

def remove_unused_glyph_definitions(svg):
 # Prune only unreferenced font outlines; never round or rewrite geometry.
 namespace='http://www.w3.org/2000/svg'
 href='{http://www.w3.org/1999/xlink}href'
 tree=ET.fromstring(svg)
 referenced={element.attrib[href][1:] for element in tree.iter() if element.attrib.get(href,'').startswith('#')}
 for definitions in tree.iter('{'+namespace+'}defs'):
  for child in list(definitions):
   identity=child.attrib.get('id','')
   if child.tag=='{'+namespace+'}path' and identity.startswith('font_') and identity not in referenced:
    definitions.remove(child)
 return ET.tostring(tree,encoding='unicode')

base=fitz.open(SOURCE)
price_slots={}
for page_number,names in model_names.items():
 matches=[]
 for block in base[page_number-1].get_text('rawdict')['blocks']:
  for line in block.get('lines',[]):
   if line['bbox'][1]>740:continue
   chars=[c for span in line['spans'] for c in span['chars']]
   text=''.join(c['c'] for c in chars)
   for match in re.finditer(r'\d{1,3}(?:,\d{3})+',text):
    matches.append((match.group(),list(rect_union(chars[match.start():match.end()]))))
 if len(matches)!=len(names):raise ValueError(f'Price count {page_number}: {len(matches)} != {len(names)}')
 price_slots[str(page_number)]=[slot(key,[round(v,3) for v in rect],label=label,sourceSample=sample) for (sample,rect),(key,label) in zip(matches,names)]

assets=[]
variants=[(n,None) for n in [1,3,4,5,6,7]]+[(2,'residential'),(2,'commercial')]
for page_number,kind in variants:
 doc=fitz.open();doc.insert_pdf(base,from_page=page_number-1,to_page=page_number-1)
 page=doc[0]
 svg_rects=[]
 def redact_dynamic(rect):
  clear_text(page,rect)
  svg_rects.append(rect)
 # Remove only dynamic blue form placeholders, leaving original vectors and images intact.
 for block in page.get_text('dict')['blocks']:
  for line in block.get('lines',[]):
   for span in line['spans']:
    if span['color']==0x5b9bd5:clear_text(page,span['bbox'])
 if page_number==1:
  for block in page.get_text('dict')['blocks']:
   for line in block.get('lines',[]):
    if any('____' in span['text'] for span in line['spans']):redact_dynamic(line['bbox'])
  # Clear the sample percentage symbol so the complete actual percentage can be overlaid.
  redact_dynamic([127.8,324.8,134.5,336.0])
 if page_number==2:
  # Source has partial-black sample year and separators; replace the complete date.
  redact_dynamic([308.0,240.0,369.0,253.0])
  # Address placeholders plus separators are one dynamic field, preserving its printed label.
  redact_dynamic([311.0,143.5,503.80,154.0])
  # Same for official communication values (printed label remains to the right).
  redact_dynamic([144.0,151.8,424.15,168.6])
  payment_rect=[48.0,423.0,560.0,644.0] if kind=='residential' else [48.0,345.0,560.0,413.5]
  redact_dynamic(payment_rect)
 if page_number in (3,4):
  for rate in price_slots[str(page_number)]:redact_dynamic(rate['rect'])
 if page_number==6:
  redact_dynamic([325.0,623.0,506.20,635.0])
  redact_dynamic([324.0,648.0,548.55,660.0])
 page.apply_redactions(images=0,graphics=0,text=0)
 if page_number==2:
  # Conceal borders of the other policy's milestone table without touching page frame/artwork.
  page.draw_rect(fitz.Rect(payment_rect),color=None,fill=(1,1,1),overlay=True)
 filename=f'page-{page_number}'+(f'-{kind}' if kind else '')+'.svg'
 svg=remove_unused_glyph_definitions(inline_image_alpha(sanitize_svg_glyphs(base[page_number-1].get_svg_image(text_as_path=True),svg_rects,payment_rect if page_number==2 else None)))
 (OUTPUT/filename).write_text(svg)
 static=page.get_text(sort=True).strip()
 page.get_pixmap(matrix=fitz.Matrix(1.65,1.65),alpha=False).save(ARTIFACT/f'sanitized-{page_number}{"-"+kind if kind else ""}.png')
 assets.append({'page':page_number,'kind':kind,'file':filename,'sourceText':static,'sha256':hashlib.sha256(svg.encode()).hexdigest()})

from agreement_2027_native_fonts import create_print_artwork

for asset in assets:
 screen_name=Path(asset['file']).stem+'-screen.svg'
 data=(OUTPUT/asset['file']).read_bytes()
 (OUTPUT/screen_name).write_bytes(data)
 asset['screenFile']=screen_name
 asset['screenSha256']=hashlib.sha256(data).hexdigest()

font_proof=create_print_artwork(SOURCE,OUTPUT,[asset['file'] for asset in assets])
(ARTIFACT/'native-font-outline-mapping.json').write_text(json.dumps(font_proof,indent=2)+'\n')
for asset in assets:
 asset['sha256']=hashlib.sha256((OUTPUT/asset['file']).read_bytes()).hexdigest()

metadata={'rendering':{'screen':'exact source glyph and vector outlines','print':'original embedded subset fonts with private-use glyph mapping','sourceGlyphOutlineMatches':True,'nativePdfFonts':True},'source':'عقد اتفاق 2027.pdf','sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'pageSize':PAGE_SIZE,'units':'PDF points, top-left origin','fields':fields,'checkboxes':checkboxes,'prices':price_slots,'paymentSections':{'residential':[48,345,560,413.5],'commercial':[48,423,560,644]},'assets':assets}
from agreement_2027_specifications import add_selection_artwork
metadata=add_selection_artwork(SOURCE,OUTPUT,metadata)
from agreement_2027_compact import add_compact_artwork
metadata=add_compact_artwork(SOURCE,OUTPUT,metadata)
(OUTPUT/'template-layout.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'assets':[a['file'] for a in assets],'price_counts':{k:len(v) for k,v in price_slots.items()},'metadata':str(OUTPUT/'template-layout.json'),'total_bytes':sum(p.stat().st_size for p in OUTPUT.iterdir())},ensure_ascii=False,indent=2))

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { asc, eq } from 'drizzle-orm';
import { db } from '@mossetech/db/client';
import { businessSettings, quotationItems, quotations } from '@mossetech/db/schema';
import { requirePermission } from '@/lib/auth/require-permission';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const styles = StyleSheet.create({ page:{paddingTop:42,paddingHorizontal:42,paddingBottom:176,fontFamily:'Helvetica',fontSize:9,color:'#172B42'}, head:{flexDirection:'row',justifyContent:'space-between',borderBottom:'2 solid #006DBB',paddingBottom:18,marginBottom:20}, brand:{fontSize:17,fontFamily:'Helvetica-Bold',color:'#006DBB'}, title:{fontSize:18,fontFamily:'Helvetica-Bold'}, muted:{color:'#60758A',fontSize:9,marginTop:5}, section:{marginBottom:20}, row:{flexDirection:'row',paddingVertical:9,borderBottom:'1 solid #DDE6EF'}, header:{backgroundColor:'#EAF1F8',fontFamily:'Helvetica-Bold'}, item:{width:'48%'}, qty:{width:'12%',textAlign:'right'}, price:{width:'20%',textAlign:'right'}, total:{width:'20%',textAlign:'right'}, totals:{marginTop:18,alignItems:'flex-end'}, sum:{marginTop:8,fontFamily:'Helvetica-Bold',fontSize:12}, note:{marginTop:12,fontSize:8,color:'#60758A'}, approval:{position:'absolute',left:42,right:42,bottom:42,height:115,borderTop:'1 solid #DDE6EF',paddingTop:13}, approvalTitle:{fontSize:8,fontFamily:'Helvetica-Bold',color:'#60758A',marginBottom:11}, approvalColumns:{flexDirection:'row',justifyContent:'space-between'}, signatureArea:{width:'44%',paddingTop:23}, signatureLine:{borderBottom:'1 solid #8295A8',height:1}, signatureLabel:{fontSize:8,color:'#60758A',marginTop:6}, stampArea:{width:'42%',height:73,border:'1 dashed #B2C0D0',alignItems:'center',justifyContent:'center'}, stampText:{fontSize:8,color:'#60758A',textAlign:'center'} });
const money = (v: string | number) => new Intl.NumberFormat('en-RW', {maximumFractionDigits:2}).format(Number(v));
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
 await requirePermission('sales.view');
 const { id } = await context.params;
 if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return new Response('Invalid reference.', {status:400});
 const [q] = await db.select().from(quotations).where(eq(quotations.id,id)).limit(1);
 if (!q) return new Response('Proforma not found.', {status:404});
 const [items, settings] = await Promise.all([db.select().from(quotationItems).where(eq(quotationItems.quotationId,id)).orderBy(asc(quotationItems.createdAt)),db.select().from(businessSettings).limit(1)]);
 const business = settings[0];
 const date = new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Kigali',dateStyle:'medium'}).format(q.issueDate);
 const pdf = await renderToBuffer(<Document title={`Mosse Tech Proforma ${q.reference}`} author={business?.businessName || 'Mosse Tech'}><Page size="A4" style={styles.page}>
 <View style={styles.head}><View><Text style={styles.brand}>{business?.businessName || 'Mosse Tech'}</Text>{business?.phone && <Text style={styles.muted}>{business.phone}</Text>}{business?.address && <Text style={styles.muted}>{business.address}</Text>}</View><View><Text style={styles.title}>PROFORMA INVOICE</Text><Text style={styles.muted}>Reference: {q.reference}</Text><Text style={styles.muted}>Issued: {date}</Text>{q.validUntil && <Text style={styles.muted}>Valid until: {q.validUntil}</Text>}</View></View>
 <View style={styles.section}><Text style={styles.muted}>PREPARED FOR</Text><Text style={{fontFamily:'Helvetica-Bold',fontSize:12,marginTop:5}}>{q.customerName}</Text>{q.customerPhone && <Text style={styles.muted}>{q.customerPhone}</Text>}</View>
 <View style={[styles.row,styles.header]}><Text style={styles.item}>Description</Text><Text style={styles.qty}>Qty</Text><Text style={styles.price}>Unit (RWF)</Text><Text style={styles.total}>Amount (RWF)</Text></View>
 {items.map(item => <View key={item.id} style={styles.row} wrap={false}><Text style={styles.item}>{item.itemName}</Text><Text style={styles.qty}>{item.quantity}</Text><Text style={styles.price}>{money(item.unitPrice)}</Text><Text style={styles.total}>{money(item.lineTotal)}</Text></View>)}
 <View style={styles.totals}><Text>Subtotal: RWF {money(q.subtotalAmount)}</Text><Text style={{marginTop:7}}>Discount: RWF {money(q.discountAmount)}</Text><Text style={styles.sum}>TOTAL: RWF {money(q.totalAmount)}</Text></View>
 {q.notes && <View style={styles.section}><Text style={styles.muted}>NOTES</Text><Text>{q.notes}</Text></View>}
 <Text style={styles.note}>This proforma is a price quotation only. It does not confirm a sale, payment, stock reservation or delivery.</Text>
 <View style={styles.approval} fixed>
   <Text style={styles.approvalTitle}>ISSUED BY MOSSE TECH</Text>
   <View style={styles.approvalColumns}>
     <View style={styles.signatureArea}><View style={styles.signatureLine}/><Text style={styles.signatureLabel}>Authorized signature</Text></View>
     <View style={styles.stampArea}><Text style={styles.stampText}>Company stamp</Text></View>
   </View>
 </View>
 </Page></Document>);
 const mode = new URL(request.url).searchParams.get('mode') === 'inline' ? 'inline' : 'attachment';
 return new Response(new Uint8Array(pdf),{headers:{'Content-Type':'application/pdf','Content-Disposition':`${mode}; filename="mosse-tech-proforma-${q.reference}.pdf"`,'Cache-Control':'private, no-store'}});
}

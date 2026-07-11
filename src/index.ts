import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import authRoutes      from './routes/auth';
import locationRoutes  from './routes/locations';
import productRoutes   from './routes/products';
import movementRoutes  from './routes/movements';
import barcodeRoutes   from './routes/barcodes';
import deliveryRoutes  from './routes/deliveries';
import reportRoutes    from './routes/reports';
import supplierRoutes  from './routes/suppliers';
import alertRoutes     from './routes/alerts';
import pushRoutes      from './routes/push';

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

app.use('/api/auth',      authRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/products',  productRoutes);
app.use('/api/movements', movementRoutes);
app.use('/api/barcodes',  barcodeRoutes);
app.use('/api/deliveries',deliveryRoutes);
app.use('/api/reports',   reportRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/alerts',    alertRoutes);
app.use('/api/push',      pushRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

const PORT = process.env.PORT || 3001;

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.warn(
    '\n⚠️  אזהרה: SUPABASE_URL / SUPABASE_SERVICE_KEY לא הוגדרו.\n' +
    '   השרת יעלה אבל כל קריאה למלאי/מוצרים/דוחות תיכשל.\n' +
    '   ראה SUPABASE_SETUP.md להוראות הגדרה.\n'
  );
}

app.listen(PORT, () => console.log(`Landwer Stock-It server running on port ${PORT}`));

export default app;

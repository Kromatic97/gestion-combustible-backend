const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config(); // Cargar variables del archivo .env

const app = express();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false
  }
});

app.use(express.json());
app.use(cors());

/* ============================
   GET: Vehículos
=============================== */
app.get('/api/vehiculos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM Vehiculo');
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener vehículos:', error);
    res.status(500).json({ error: 'Error al obtener vehículos' });
  }
});

/* ============================
   GET: Choferes
=============================== */
app.get('/api/choferes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM Chofer');
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener choferes:', error);
    res.status(500).json({ error: 'Error al obtener choferes' });
  }
});

/* ============================
   GET: Lugares
=============================== */
app.get('/api/lugares', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM Lugar');
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener lugares:', error);
    res.status(500).json({ error: 'Error al obtener lugares' });
  }
});

// ============================
// 2. Obtener lista de abastecimientos
// ============================
app.get('/api/abastecimientos', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        a.AbastecimientoID,
        a.Fecha,
        a.Cant_Litros,
        a.KilometrajeActual,
        v.Denominacion AS Vehiculo,
        c.NombreChofer AS Chofer,
        l.NombreLugar AS Lugar
      FROM Abastecimiento a
      JOIN Vehiculo v ON a.VehiculoID = v.VehiculoID
      JOIN Chofer c ON a.ChoferID = c.ChoferID
      JOIN Lugar l ON a.LugarID = l.LugarID
      ORDER BY a.Fecha DESC
      LIMIT 10
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener abastecimientos:', error);
    res.status(500).json({ error: 'Error al obtener abastecimientos' });
  }
});


/* ============================
   GET: Stock actual
=============================== */
app.get('/api/stock', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT LitroActual
      FROM StockCombustible
      ORDER BY FechaTransaccion DESC
      LIMIT 1
    `);
    res.json(result.rows[0] || { litroactual: 10000 });
  } catch (error) {
    console.error('Error al obtener stock:', error);
    res.status(500).json({ error: 'Error al obtener stock' });
  }
});

/* ============================
   GET: Abastecimientos (últimos 20)
=============================== */
app.get('/api/abastecimientos', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, v.Denominacion AS Vehiculo, c.NombreChofer AS Chofer, l.NombreLugar AS Lugar
      FROM Abastecimiento a
      JOIN Vehiculo v ON v.VehiculoID = a.VehiculoID
      JOIN Chofer c ON c.ChoferID = a.ChoferID
      JOIN Lugar l ON l.LugarID = a.LugarID
      ORDER BY a.Fecha DESC
      LIMIT 20
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener abastecimientos:', error);
    res.status(500).json({ error: 'Error al obtener abastecimientos' });
  }
});

/* ============================
   POST: Registrar abastecimiento
=============================== */
app.post('/api/abastecimientos', async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      Fecha,
      VehiculoID,
      KilometrajeActual,
      CantLitros,
      LugarID,
      ChoferID
    } = req.body;

    const fechaHora = new Date();
    const litros = Number(CantLitros);
    const kilometraje = Number(KilometrajeActual);
    if (isNaN(litros) || isNaN(kilometraje)) {
      return res.status(400).json({ error: 'Datos numéricos inválidos' });
    }

    await client.query('BEGIN');

    const resultAbast = await client.query(
      `INSERT INTO Abastecimiento (Fecha, VehiculoID, KilometrajeActual, Cant_Litros, LugarID, ChoferID)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING AbastecimientoID`,
      [fechaHora, VehiculoID, kilometraje, litros, LugarID, ChoferID]
    );

    const abastecimientoID = resultAbast.rows[0].abastecimientoid;

    const resultStock = await client.query(
      `SELECT LitroActual FROM StockCombustible ORDER BY FechaTransaccion DESC LIMIT 1`
    );

    const litroActualRaw = resultStock.rows[0]?.litroactual ?? 10000;
    const litroActual = Number(litroActualRaw);
    const nuevoStock = isNaN(litroActual) ? 10000 - litros : litroActual - litros;

    const resultNewStock = await client.query(
      `INSERT INTO StockCombustible (FechaTransaccion, LitroActual)
       VALUES ($1, $2) RETURNING StockCombustibleID`,
      [fechaHora, nuevoStock]
    );

    const nuevoStockID = resultNewStock.rows[0].stockcombustibleid;

    await client.query(
      `INSERT INTO Abastecimiento_StockCombustible (AbastecimientoID, StockCombustibleID, FechaTransaccion)
       VALUES ($1, $2, $3)`,
      [abastecimientoID, nuevoStockID, fechaHora]
    );

    await client.query('COMMIT');

    res.json({
      mensaje: 'Abastecimiento registrado correctamente',
      abastecimientoID,
      nuevoStock,
      alarma: nuevoStock <= 1500
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al registrar abastecimiento:', error);
    res.status(500).json({ error: 'Error al registrar abastecimiento' });
  } finally {
    client.release();
  }
});

/* ============================
   Iniciar servidor
=============================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
});



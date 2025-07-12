const pool = require('../db');

exports.registrarAbastecimiento = async (req, res) => {
  let client;
  try {
    const { Fecha, VehiculoID, KilometrajeActual, Cant_Litros, LugarID, ChoferID } = req.body;

    const litros = parseFloat(Cant_Litros);
    if (isNaN(litros)) {
      return res.status(400).json({ error: 'Cantidad de litros inválida' });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    // 1. Insertar nuevo abastecimiento
    const insertAbastecimiento = await client.query(
      `INSERT INTO Abastecimiento (Fecha, VehiculoID, KilometrajeActual, Cant_Litros, LugarID, ChoferID)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING AbastecimientoID`,
      [Fecha, VehiculoID, KilometrajeActual, litros, LugarID, ChoferID]
    );

    const abastecimientoID = insertAbastecimiento.rows[0].abastecimientoid;

    // 2. Obtener el último stock
    const stockRes = await client.query(
      `SELECT * FROM StockCombustible ORDER BY FechaTransaccion DESC LIMIT 1`
    );
    const stockActual = parseFloat(stockRes.rows[0]?.litroactual ?? 10000);

    // Verificar si stock es válido
    if (isNaN(stockActual)) {
      throw new Error('Stock actual inválido');
    }

    // 3. Calcular nuevo stock
    const nuevoStock = stockActual - litros;

    // 4. Insertar nuevo registro de stock
    const insertStock = await client.query(
      `INSERT INTO StockCombustible (FechaTransaccion, LitroActual)
       VALUES (NOW(), $1) RETURNING StockCombustibleID`,
      [nuevoStock]
    );

    const stockCombustibleID = insertStock.rows[0].stockcombustibleid;

    // 5. Registrar en tabla puente
    await client.query(
      `INSERT INTO Abastecimiento_StockCombustible (AbastecimientoID, StockCombustibleID, FechaTransaccion)
       VALUES ($1, $2, NOW())`,
      [abastecimientoID, stockCombustibleID]
    );

    // 6. Verificar si debe sonar alarma
    const alarma = nuevoStock <= 1500;

    await client.query('COMMIT');
    res.json({
      mensaje: 'Abastecimiento registrado correctamente',
      abastecimientoID,
      nuevoStock,
      alarma
    });

  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Error al registrar abastecimiento:', error.message);
    res.status(500).json({ error: 'Error al registrar abastecimiento' });
  } finally {
    if (client) client.release();
  }
};

exports.obtenerStockActual = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT LitroActual
      FROM StockCombustible
      ORDER BY FechaTransaccion DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No hay registros de stock disponibles' });
    }

    res.json({ litroactual: result.rows[0].litroactual });
  } catch (error) {
    console.error('Error al obtener stock actual:', error.message);
    res.status(500).json({ error: 'Error al obtener stock actual' });
  }
};


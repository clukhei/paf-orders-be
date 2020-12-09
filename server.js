const express = require("express");
const mysql = require("mysql2/promise");
const bodyParser = require("body-parser");
const cors = require("cors");
const secureEnv = require("secure-env");

const app = express();
app.use(cors());
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));
app.use(bodyParser.json({ limit: "50mb" }));

global.env = secureEnv({ secret: "password" });
const APP_PORT = global.env.APP_PORT;

const pool = mysql.createPool({
	host: global.env.MYSQL_SERVER,
	port: global.env.MYSQL_SVR_PORT,
	user: global.env.MYSQL_USERNAME,
	password: global.env.MYSQL_PASSWORD,
	database: global.env.MYSQL_SCHEMA,
	connectionLimit: global.env.MYSQL_CON_LIMIT,
});

const SQL_queryComputerOrdersView = "SELECT * from computer_orders where id=?";

const makeQuery = (sqlQuery, pool) => {
	return async (args) => {
		const conn = await pool.getConnection();
		try {
			let results = await conn.query(sqlQuery, args || []);
			return results[0];
		} catch (e) {
			console.log(e);
		} finally {
			conn.release();
		}
	};
};

const executeComputerOrdersView = makeQuery(SQL_queryComputerOrdersView, pool);

app.get("/orders/total/:orderId", (req, res) => {
	const orderId = req.params.orderId;
	executeComputerOrdersView([orderId])
		.then((results) => {
			console.log(results);
			if (results.length > 0) {
				res.format({
					"text/html": () => {
						console.log("text/html");
						res.send(results);
					},
					"application/json": () => {
						console.log("json");
						res.status(200).json(results);
					},
				});
			} else res.status(404).json({ message: "No record found" });
		})
		.catch((e) => {
			console.log(e);
			res.status(404).json(e);
		});
});

const SQL_INSERT_ORDERS = `INSERT INTO orders(
  id,
  employee_id,
  customer_id,
  shipper_id,
  ship_name,
  ship_address,
  ship_city,
  ship_state_province,
  ship_zip_postal_code,
  ship_country_region,
  shipping_fee,
  taxes,
  payment_type,
  notes,
  tax_rate,

  status_id
  ) VALUES(?,?,?,?, ?, ?, ?, ?,?,?, ?,?,?,?,?,?)`;

const SQL_INSERT_ORDERDETAILS = `
  INSERT INTO order_details(
    order_id,
      product_id,
      quantity,
      unit_price,
      discount, 
      status_id,
      purchase_order_id,
      inventory_id
  ) values(
    ?,?,?,?,?,?,?,?
  ) ;`;

  const SQL_GET_NEXT_ORDER_ID = `select MAX(id)+1 AS next_id from orders`

const makeOrdersTransaction = async (args1, args2, res) => {

  const conn = await pool.getConnection();

	try {
    await conn.beginTransaction();
    const [[result]] = await conn.query(SQL_GET_NEXT_ORDER_ID)
    const nextId = result.next_id
    console.log(nextId)
    args1.unshift(nextId)
    args2.unshift(nextId)
		let orderResults = await conn.query(SQL_INSERT_ORDERS, args1);
		console.log("orderResults",orderResults);
		let orderDetailsResults = await conn.query(
			SQL_INSERT_ORDERDETAILS,
      args2
		);
		console.log("order details",orderDetailsResults);
		await conn.commit();
	} catch (e) {
    console.log(e)
    conn.rollback();
    res.status(500).json({message: e})
	} finally {
		conn.release();
	}
};

app.post("/orders", (req, res) => {
	const orderValues = Object.values(req.body);
	orderValues.pop();
	const orderDetailsValues = Object.values(req.body.orderDetails);
	makeOrdersTransaction(orderValues, orderDetailsValues,res);
  res.status(200).json({})
});

const startApp = async (app, pool) => {
	const conn = await pool.getConnection();
	try {
		console.log("ping database..");
		await conn.ping();
		app.listen(APP_PORT, () => {
			console.log(`App started ${APP_PORT}`);
		});
	} catch (e) {
		console.log(e);
	} finally {
		conn.release();
	}
};

app.use((req, res) => {
	res.redirect("/");
});
startApp(app, pool);

const express = require("express");
const app = express();

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const path = require("path")
const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

app.use(express.json());

let db = null;

const initializeDBAndServer = async (request, response) => {
    try {
        db = await open({
            filename: dbPath,
            driver: sqlite3.Database,
        });

        app.listen(3000, () => {
            console.log("Server Running at http://localhost:3000/");
        });

    } catch(e) {
        console.log(`DB Error: ${e.message}`);
        process.exit(1);
    }
};

initializeDBAndServer();

module.exports = app;

// POST - USER REGISTER API
app.post("/users/", async (request, response) => {
  const { username, name, password, gender, location } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    const createUserQuery = `
      INSERT INTO 
        user (username, name, password, gender, location) 
      VALUES 
        (
          '${username}', 
          '${name}',
          '${hashedPassword}', 
          '${gender}',
          '${location}'
        )`;
    const dbResponse = await db.run(createUserQuery);
    const newUserId = dbResponse.lastID;
    response.send(`Created new user with ${newUserId}`);
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API 1 - POST If an unregistered user tries to login
app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "CHANDUKALISETTI");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// Authentication with Token
const authenticateToken = async (request, response, next) => {
    let jwtToken;
    const authHeader = request.headers["authorization"];
    if (authHeader !== undefined) {
        jwtToken = authHeader.split(" ")[1];
    }
    if (jwtToken === undefined) {
        response.status(401);
        response.send("Invalid JWT Token");
    } else {
        jwt.verify(jwtToken, "CHANDUKALISETTI", async (error, payload) => {
        if (error) {
            response.status(401);
            response.send("Invalid JWT Token");
        } else {
            next();
        }
    });
    }
};

// FUNCTION for Convert Database Object To Response Object of State Table Details
const convertDBObjectToResponseObjectForState = (dbObject) => {
        return {
            stateId: dbObject.state_id,
            stateName: dbObject.state_name,
            population: dbObject.population
        };
    };

// FUNCTION for Convert Database Object To Response Object of District Table Details
const convertDBObjectToResponseObjectForDistrict = (dbObject) => {
        return {
            districtId: dbObject.district_id,
            districtName: dbObject.district_name,
            stateId: dbObject.state_id,
            cases: dbObject.cases,
            cured: dbObject.cured,
            active: dbObject.active,
            deaths: dbObject.deaths,
        };
    };

// API 2 - GET Returns a list of all states in the state table
app.get("/states/", authenticateToken, async (request, response) => {
    const getStatesQuery = `
        SELECT
            *
        FROM
            state
        ORDER BY
            state_id;`;

    const getStatesArray = await db.all(getStatesQuery);
    response.send(getStatesArray.map((eachState) =>
        convertDBObjectToResponseObjectForState(eachState)
    )
    );
});

// API 3 - GET Returns a state based on the state ID
app.get("/states/:stateId/", authenticateToken, async (request, response) => {
    const { stateId } = request.params;

    const getAStateQuery = `
            SELECT 
                *
            FROM 
                state
            WHERE 
                state_id = ${stateId};`;

    const dbResponse = await db.get(getAStateQuery);
    response.send(convertDBObjectToResponseObjectForState(dbResponse));
});

// API 4 - Create a district in the district table, district_id is auto-incremented
app.post("/districts/", authenticateToken, async (request, response) => {
    const districtDetails = request.body;
    const { districtName, stateId, cases, cured, active, deaths } = districtDetails;

    const createADistrictQuery = `
            INSERT INTO 
                district (district_name, state_id, cases, cured, active, deaths)
            VALUES 
                (
                '${districtName}',
                    ${stateId},
                    ${cases},
                    ${cured},
                    ${active},
                    ${deaths}
                );`;

    const addDistrict = await db.run(createADistrictQuery);
    response.send("District Successfully Added");
});

// API 5 - GET Returns a district based on the district ID
app.get("/districts/:districtId/", authenticateToken, async (request, response) => {
    const { districtId } = request.params;

    const getADistrictQuery = `
            SELECT 
                *
            FROM 
                district
            WHERE 
                district_id = ${districtId};`;

    const dbResponse = await db.get(getADistrictQuery);
    response.send(convertDBObjectToResponseObjectForDistrict(dbResponse));
});

// API 6 - DELETE Deletes a district from the district table based on the district ID
app.delete("/districts/:districtId/", authenticateToken,async (request, response) => {
    const { districtId } = request.params;

    const deleteADistrictQuery = `
        DELETE FROM
            district
        WHERE 
            district_id = ${districtId};`;
    
    await db.run(deleteADistrictQuery);
    response.send("District Removed");
});

// API 7 - PUT Updates the details of a specific district based on the district ID
app.put("/districts/:districtId/", authenticateToken, async (request, response) => {
    const { districtId } = request.params;
    const districtDetails = request.body;

    const { districtName, stateId, cases, cured, active, deaths } = districtDetails;

    const updateDistrictDetailsQuery = `
        UPDATE
            district
        SET
            district_name = '${districtName}',
            state_id = ${stateId},
            cases = ${cases},
            cured = ${cured},
            active = ${active},
            deaths = ${deaths}
        WHERE
            district_id = ${districtId};`;
    
    await db.run(updateDistrictDetailsQuery);
    response.send("District Details Updated");
});

// API 8 - GET Returns the statistics of total cases, cured, active, deaths of a specific state based on state ID
app.get("/states/:stateId/stats/", authenticateToken, async (request, response) => {
    const { stateId } = request.params;

    const getStatisticsQuery = `
        SELECT
            SUM(cases) AS total_cases,
            SUM(cured) AS total_cured,
            SUM(active) AS total_active,
            SUM(deaths) AS total_deaths
        FROM
            district
        WHERE
            state_id = ${stateId};`;

    const convertDBObjectToResponseObject = (dbObject) => {
        return {
            totalCases: dbObject.total_cases,
            totalCured: dbObject.total_cured,
            totalActive: dbObject.total_active,
            totalDeaths: dbObject.total_deaths
        };
    };

    const dbResponse = await db.get(getStatisticsQuery);
    response.send( convertDBObjectToResponseObject(dbResponse) );
});

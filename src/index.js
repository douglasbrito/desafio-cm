const AWS = require('aws-sdk');
AWS.config.update( {
  region: process.env.AWS_REGION
});
const dynamodb = new AWS.DynamoDB.DocumentClient();
const Path = {
  BRAND: '/marca',
  CATEGORY: '/categoria',
  PRODUCT: '/produto'
};
const TableName = {
  BRAND: 'marcas',
  CATEGORY: 'categorias',
  PRODUCT: 'produtos'
};
const FieldNameID = 'id';

exports.handler = async function(event) {
  console.log('Request event: ', event);
  const mapPath = {};
  mapPath[Path.BRAND] = TableName.BRAND;
  mapPath[Path.CATEGORY] = TableName.CATEGORY;
  mapPath[Path.PRODUCT] = TableName.PRODUCT;
  const tableName = mapPath[event.path];
  let response;
  if (tableName) {
    switch(event.httpMethod) {
      case 'GET':
        if (event.queryStringParameters && event.queryStringParameters.id) {
          const docFound = await findDocumentById(tableName, event.queryStringParameters.id);
          response = buildResponse(200, docFound);
        } else {
          response = await getDocuments(tableName);
        }
        break;
      case 'POST':
        response = await createDocument(tableName, JSON.parse(event.body));
        break;
      case 'PATCH':
        const requestBody = JSON.parse(event.body);
        response = await updateDocument({
          tableName: tableName,
          id: requestBody.id,
          fieldsUpdated: requestBody
        });
        break;
      case 'DELETE':
        response = await deleteDocument(tableName, JSON.parse(event.body).id);
        break;
      default:
        response = buildResponse(404, '404 Not Found');
    }
  } else {
    response = buildResponse(500, '');
  }
  return response;
};

/**
 * @param {Object} opt
 * @param {String} opt.tableName
 * @param {Object} opt.fieldsToSearch
 * @return {Object}
 */
async function queryDocument(opt) {
  let expression = calcExpression({fields: opt.fieldsToSearch, keysSeparator: ' and '});
  const params = {
    TableName: opt.tableName,
    IndexName: expression.index,
    KeyConditionExpression: expression.keys,
    ExpressionAttributeValues: expression.values
  };

  console.log(`queryDocument params ${JSON.stringify(params)}`);

  return await dynamodb.query(params).promise().then((response) => {
    return response.Items;
  });
}

async function findDocumentById(tableName, id) {
  const params = {
    TableName: tableName,
    Key: {
      'id': id
    }
  };

  return await dynamodb.get(params).promise().then((response) => {
    return response.Item;
  });
}

async function getDocuments(tableName) {
  const params = {
    TableName: tableName
  };
  const allDocuments = await scanDynamoRecords(params, []);
  const body = {
    documents: allDocuments
  };
  return buildResponse(200, body);
}

async function scanDynamoRecords(scanParams, itemArray) {
  try {
    const dynamoData = await dynamodb.scan(scanParams).promise();
    itemArray = itemArray.concat(dynamoData.Items);
    if (dynamoData.LastEvaluatedKey) {
      scanParams.ExclusiveStartkey = dynamoData.LastEvaluatedKey;
      return await scanDynamoRecords(scanParams, itemArray);
    }
    return itemArray;
  } catch(error) {
    console.error('Do your custom error handling here. I am just gonna log it: ', error);
  }
}

async function createDocument(tableName, requestBody) {
  const params = {
    TableName: tableName,
    Item: requestBody
  };
  const msgError = await validateBeforeCreate(tableName, requestBody);
  let response;

  console.log(`createDocument params ${JSON.stringify(params)}`);

  if (msgError) {
    response = buildResponse(400, msgError);
  } else {
    response = await dynamodb.put(params).promise().then(() => {
      const body = {
        operation: 'SAVE',
        message: 'SUCCESS',
        item: requestBody
      };
      return buildResponse(200, body);
    });
  }
  return response;
}

/**
 * @param {Object} doc
 * @param {String} doc.tableName
 * @param {String} doc.id
 * @param {Object} doc.fieldsUpdated
 * @return {Object}
 * */
async function updateDocument(doc) {
  let expression = calcExpression({fields: doc.fieldsUpdated, keysSeparator: ', '});
  const params = {
    TableName: doc.tableName,
    Key: {
      'id': doc.id
    },
    UpdateExpression: `set ${expression.keys}`,
    ExpressionAttributeValues: expression.values,
    ReturnValues: 'UPDATED_NEW'
  };

  return await dynamodb.update(params).promise().then((response) => {
    const body = {
      operation: 'UPDATE',
      message: 'SUCCESS',
      updatedAttributes: response
    };
    return buildResponse(200, body);
  });
}

async function deleteDocument(tableName, id) {
  const params = {
    TableName: tableName,
    Key: {
      'id': id
    },
    ReturnValues: 'ALL_OLD'
  };
  return await dynamodb.delete(params).promise().then((response) => {
    const body = {
      operation: 'DELETE',
      message: 'SUCCESS',
      item: response
    };
    return buildResponse(200, body);
  });
}

function buildResponse(statusCode, body) {
  return {
    statusCode: statusCode,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  };
}

async function validateBeforeCreate(tableName, requestBody) {
  const mapLabel = {};
  mapLabel[TableName.BRAND] = 'uma marca';
  mapLabel[TableName.CATEGORY] = 'uma categoria';
  mapLabel[TableName.PRODUCT] = 'um produto';
  const mapFieldsRequired = {};
  mapFieldsRequired[TableName.BRAND] = ['id', 'nome'];
  mapFieldsRequired[TableName.CATEGORY] = ['id', 'nome'];
  mapFieldsRequired[TableName.PRODUCT] = [
    'id', 'descricao', 'idMarca', 'nomeMarca', 'precoVenda', 'categorias'
  ];
  const label = mapLabel[tableName];
  const fieldsRequired = mapFieldsRequired[tableName];
  let missingFields = [];
  let alreadyExists = false;
  let fieldsToSearch;
  let msgError = '';
  let complementaryMsg = '';

  fieldsRequired.map((fieldName) => {
    if (!requestBody[fieldName]) {
      missingFields.push(fieldName);
    }
  });

  if (missingFields.length > 0) {
    msgError = 'Não é possível incluir o registro, pois os seguintes campos '+
      `obrigatórios não foram preenchidos: ${missingFields.join(', ')}.`;
  } else {
    alreadyExists = await findDocumentById(tableName, requestBody.id);

    if (alreadyExists) {
      msgError = `Já existe ${label} cadastrado(a) com o ID ${requestBody.id}.`;
    } else {
      if (tableName == TableName.PRODUCT) {
        fieldsToSearch = {
          'descricao': requestBody.descricao,
          'idMarca': requestBody.idMarca
        };
        complementaryMsg = `com a descrição ${requestBody.descricao} e o ID de marca ${requestBody.idMarca}`;
      } else {
        fieldsToSearch = {
          'nome': requestBody.nome
        };
        complementaryMsg = `com o nome ${requestBody.nome}`;
      }

      alreadyExists = await queryDocument({
        tableName: tableName,
        fieldsToSearch: fieldsToSearch
      });

      if (alreadyExists && alreadyExists.length > 0) {
        msgError = `Já existe ${label} cadastrado(a) ${complementaryMsg}.`;
      }
    }
  }

  return msgError;
}

/**
 * @param {Object} opt
 * @param {Object} opt.fields
 * @param {String?} opt.keysSeparator
 * @return {Object}
 */
function calcExpression(opt) {
  let expressions = [];
  const keys = Object.keys(opt.fields);
  const values = {};
  keys.map((key, index) => {
    if (key != FieldNameID) {
      const expressionValue = `:value${index}`;
      let value = opt.fields[key];
      if (value instanceof Object) {
        value = JSON.stringify(value);
      }
      expressions.push( `${key} = ${expressionValue}` );
      values[expressionValue] = value;
    }
  });
  return {
    keys: expressions.join(opt.keysSeparator),
    values: values,
    index: `${keys.join('-')}-index`
  };
}

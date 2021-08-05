class Document {
  /**
   * @param {Object} opt
   * @param {Object} opt.db
   * @param {Object} opt.s3
   * @param {String} opt.bucketName
   * @param {String} opt.tableName
   * @param {String} opt.tableLabel
   * @param {String[]} opt.fieldsRequired
   */
  constructor(opt) {
    this.dynamodb = opt.db;
    this.s3 = opt.s3;
    this.bucketName = opt.bucketName;
    this.tableName = opt.tableName;
    this.tableLabel = opt.tableLabel;
    this.fieldsRequired = opt.fieldsRequired;
  }

  /**
   * @param {Object} fieldsToSearch
   * @return {Object}
   */
  async query(fieldsToSearch) {
    let expression = this.calcExpression({fields: fieldsToSearch, keysSeparator: ' and '});
    const params = {
      TableName: this.tableName,
      IndexName: expression.index,
      KeyConditionExpression: expression.keys,
      ExpressionAttributeValues: expression.values
    };

    return await this.dynamodb.query(params).promise().then((response) => {
      return response.Items;
    });
  }

  async findById(id) {
    const params = {
      TableName: this.tableName,
      Key: {
        'id': id
      }
    };

    return await this.dynamodb.get(params).promise().then((response) => {
      return response.Item;
    });
  }

  async getDocuments() {
    const params = {
      TableName: this.tableName
    };
    const allDocuments = await this.scanDynamoRecords(params, []);
    const body = {
      documents: allDocuments
    };
    return this.buildResponse(200, body);
  }

  async scanDynamoRecords(scanParams, itemArray) {
    try {
      const dynamoData = await this.dynamodb.scan(scanParams).promise();
      itemArray = itemArray.concat(dynamoData.Items);
      if (dynamoData.LastEvaluatedKey) {
        scanParams.ExclusiveStartkey = dynamoData.LastEvaluatedKey;
        return await this.scanDynamoRecords(scanParams, itemArray);
      }
      return itemArray;
    } catch(error) {
      console.error('Do your custom error handling here. I am just gonna log it: ', error);
    }
  }

  async create(requestBody) {
    const msgError = await this.validateBeforeCreate(requestBody);
    let response;

    if (msgError) {
      response = this.buildResponse(400, msgError);
    } else {
      this.uploadImages(requestBody);

      const params = {
        TableName: this.tableName,
        Item: requestBody
      };
      response = await this.dynamodb.put(params).promise().then(() => {
        const body = {
          operation: 'SAVE',
          message: 'SUCCESS',
          item: requestBody
        };
        return this.buildResponse(200, body);
      });
    }
    return response;
  }

  async update(requestBody) {
    let expression = this.calcExpression({fields: requestBody, keysSeparator: ', '});
    const params = {
      TableName: this.tableName,
      Key: {
        'id': requestBody.id
      },
      UpdateExpression: `set ${expression.keys}`,
      ExpressionAttributeValues: expression.values,
      ReturnValues: 'UPDATED_NEW'
    };

    return await this.dynamodb.update(params).promise().then((response) => {
      const body = {
        operation: 'UPDATE',
        message: 'SUCCESS',
        updatedAttributes: response
      };
      return this.buildResponse(200, body);
    });
  }

  async delete(id) {
    const params = {
      TableName: this.tableName,
      Key: {
        'id': id
      },
      ReturnValues: 'ALL_OLD'
    };
    return await this.dynamodb.delete(params).promise().then((response) => {
      const body = {
        operation: 'DELETE',
        message: 'SUCCESS',
        item: response
      };
      return this.buildResponse(200, body);
    });
  }

  buildResponse(statusCode, body) {
    return {
      statusCode: statusCode,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    };
  }

  async validateBeforeCreate(requestBody) {
    const label = this.tableLabel;
    const fieldsRequired = this.fieldsRequired;
    let missingFields = [];
    let alreadyExists = false;
    let msgError = '';

    fieldsRequired.map((fieldName) => {
      if (!requestBody[fieldName]) {
        missingFields.push(fieldName);
      }
    });

    if (missingFields.length > 0) {
      msgError = 'Não é possível incluir o registro, pois os seguintes campos '+
        `obrigatórios não foram preenchidos: ${missingFields.join(', ')}.`;
    } else {
      alreadyExists = await this.findById(requestBody.id);

      if (alreadyExists) {
        msgError = `Já existe ${label} cadastrado(a) com o ID ${requestBody.id}.`;
      } else {
        const paramsToQuery = this.getParamsToQueryDocument(requestBody);

        alreadyExists = await this.query(paramsToQuery.fieldsToSearch);

        if (alreadyExists && alreadyExists.length > 0) {
          msgError = `Já existe ${label} cadastrado(a) ${paramsToQuery.complementaryMsg}.`;
        }
      }
    }

    return msgError;
  }

  getParamsToQueryDocument() {
    return {
      fieldsToSearch: {},
      complementaryMsg: ''
    };
  }

  /**
   * @param {Object} opt
   * @param {Object} opt.fields
   * @param {String?} opt.keysSeparator
   * @return {Object}
   */
  calcExpression(opt) {
    let expressions = [];
    const keys = Object.keys(opt.fields);
    const values = {};
    const FieldNameID = 'id';

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

  async uploadImages(requestBody) {
    let files = [];
    const uploaded = [];
    if (requestBody.imagens && (requestBody.imagens instanceof Array)) {
      files = requestBody.imagens;
    } else if (requestBody.imagem) {
      files = [requestBody.imagem];
    }

    files.map((base64File) => {
      const decodedFile = Buffer.from(base64File.replace(/^data:image\/\w+;base64,/, ""), 'base64');
      const key = `imagens/${requestBody.id}-${new Date().toISOString()}.jpeg`;
      const params = {
        Bucket: this.bucketName,
        Key: key,
        Body: decodedFile,
        ContentType: 'image/jpeg'
      };
      this.s3.upload(params).promise();
      uploaded.push({bucket: this.bucketName, key: key});
    });

    if (uploaded.length > 0 && requestBody.imagens) {
      requestBody.imagens = uploaded;
    } else if (uploaded.length > 0 && requestBody.imagem) {
      requestBody.imagem = uploaded[0];
    }
  }
}

module.exports = Document;

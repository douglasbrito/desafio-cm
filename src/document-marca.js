const Document = require('./document');

class DocumentMarca extends Document {
  /**
   * @param {Object} opt
   * @param {Object} opt.db
   * @param {Object} opt.s3
   * @param {String} opt.bucketName
   */
  constructor(opt) {
    super({
      ...opt,
      tableName: 'marcas',
      tableLabel: 'uma marca',
      fieldsRequired: ['id', 'nome']
    });
  }

  getParamsToQueryDocument(requestBody) {
    return {
      fieldsToSearch: {
        'nome': requestBody.nome
      },
      complementaryMsg: `com o nome ${requestBody.nome}`
    };
  }
}

module.exports = DocumentMarca;

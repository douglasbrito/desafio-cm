const Document = require('./document');

class DocumentProduto extends Document {
  /**
   * @param {Object} opt
   * @param {Object} opt.db
   * @param {Object} opt.s3
   * @param {String} opt.bucketName
   */
  constructor(opt) {
    super({
      ...opt,
      tableName: 'produtos',
      tableLabel: 'um produto',
      fieldsRequired: [
        'id', 'descricao', 'idMarca', 'nomeMarca', 'precoVenda', 'categorias'
      ]
    });
  }

  getParamsToQueryDocument(requestBody) {
    return {
      fieldsToSearch: {
        'descricao': requestBody.descricao,
        'idMarca': requestBody.idMarca
      },
      complementaryMsg: `com a descrição ${requestBody.descricao} e o ID de marca ${requestBody.idMarca}`
    };
  }
}

module.exports = DocumentProduto;

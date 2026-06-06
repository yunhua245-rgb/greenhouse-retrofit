// === 共享字段架构 — 29 字段 6 分组（项目信息唯一来源）===

const FIELD_GROUPS = [
{id:'client', icon:'👤', titleZh:'客户基本信息', titleEn:'Client Info', titleRu:'Информация о клиенте', fields:[
{key:'clientCompany',  labelZh:'公司名称',     labelEn:'Company Name',        labelRu:'Компания',          type:'text'},
{key:'contactPerson',  labelZh:'联系人',       labelEn:'Contact Person',      labelRu:'Контактное лицо',   type:'text'},
{key:'contactMethod',  labelZh:'联系方式',     labelEn:'Contact Method',      labelRu:'Способ связи',     type:'text'},
{key:'location',       labelZh:'国家/城市',    labelEn:'Country/City',        labelRu:'Страна/Город',     type:'text'},
{key:'companyType',    labelZh:'公司类型',     labelEn:'Company Type',        labelRu:'Тип компании',     type:'text'},
{key:'companyScale',   labelZh:'公司规模',     labelEn:'Company Scale',       labelRu:'Масштаб',          type:'text'},
]},
{id:'product', icon:'📦', titleZh:'产品需求', titleEn:'Product Requirements', titleRu:'Требования к продукту', fields:[
{key:'productName',    labelZh:'产品名称/类别', labelEn:'Product Name',        labelRu:'Продукт',           type:'text'},
{key:'productUsage',   labelZh:'用途/场景',    labelEn:'Usage/Application',   labelRu:'Назначение',        type:'textarea'},
{key:'specifications', labelZh:'规格参数',     labelEn:'Specifications',      labelRu:'Характеристики',    type:'textarea'},
{key:'quantity',       labelZh:'采购数量',     labelEn:'Quantity',            labelRu:'Количество',        type:'text'},
{key:'certifications', labelZh:'认证要求',     labelEn:'Certifications',      labelRu:'Сертификация',      type:'text'},
{key:'sampleDrawing',  labelZh:'样品/图纸',    labelEn:'Samples/Drawings',    labelRu:'Образцы/Чертежи',   type:'text'},
{key:'packagingReq',   labelZh:'包装要求',     labelEn:'Packaging Req.',      labelRu:'Упаковка',          type:'text'},
]},
{id:'budget', icon:'💰', titleZh:'价格与预算', titleEn:'Pricing & Budget', titleRu:'Цена и бюджет', fields:[
{key:'budget',         labelZh:'目标价格/预算', labelEn:'Target Price/Budget', labelRu:'Бюджет',            type:'text'},
{key:'currency',       labelZh:'币种',         labelEn:'Currency',            labelRu:'Валюта',            type:'text'},
{key:'tradeTerms',     labelZh:'贸易条款',     labelEn:'Trade Terms',         labelRu:'Условия торговли',  type:'text'},
{key:'paymentTerms',   labelZh:'付款方式',     labelEn:'Payment Terms',       labelRu:'Оплата',            type:'text'},
]},
{id:'logistics', icon:'🚚', titleZh:'物流与交期', titleEn:'Logistics & Delivery', titleRu:'Логистика', fields:[
{key:'destination',     labelZh:'目的港/收货地', labelEn:'Destination Port',   labelRu:'Порт назначения',   type:'text'},
{key:'timeline',        labelZh:'期望交期',      labelEn:'Timeline',            labelRu:'Сроки',             type:'text'},
{key:'shippingMethod',  labelZh:'运输方式',      labelEn:'Shipping Method',     labelRu:'Доставка',          type:'text'},
{key:'customsClearance',labelZh:'清关协助',      labelEn:'Customs Clearance',   labelRu:'Таможня',           type:'text'},
]},
{id:'supplier', icon:'🏭', titleZh:'供应商要求', titleEn:'Supplier Requirements', titleRu:'Требования к поставщику', fields:[
{key:'supplierType',   labelZh:'供应商类型',   labelEn:'Supplier Type',       labelRu:'Тип поставщика',    type:'text'},
{key:'supplierRegion', labelZh:'地区偏好',     labelEn:'Preferred Region',    labelRu:'Регион',            type:'text'},
{key:'factoryAudit',   labelZh:'验厂需求',     labelEn:'Factory Audit',       labelRu:'Аудит фабрики',     type:'text'},
{key:'sampleNeeded',   labelZh:'打样需求',     labelEn:'Sample Needed',       labelRu:'Образцы',           type:'text'},
{key:'oemOdm',         labelZh:'OEM/ODM模式',  labelEn:'OEM/ODM',             labelRu:'OEM/ODM',           type:'text'},
]},
{id:'aftersale', icon:'🔧', titleZh:'售后与其他', titleEn:'After-sales & Other', titleRu:'Послепродажное обслуживание', fields:[
{key:'warranty',           labelZh:'质保要求',   labelEn:'Warranty',              labelRu:'Гарантия',                 type:'text'},
{key:'afterSales',         labelZh:'售后支持',   labelEn:'After-sales Support',   labelRu:'Поддержка',               type:'text'},
{key:'cooperationIntent',  labelZh:'合作意向',   labelEn:'Cooperation Intent',    labelRu:'Намерения',               type:'textarea'},
]},
{id:'projectDetail', icon:'📋', titleZh:'项目详情', titleEn:'Project Details', titleRu:'Детали проекта', fields:[
{key:'area',               labelZh:'温室面积',   labelEn:'Greenhouse Area',       labelRu:'Площадь теплицы',         type:'text'},
{key:'structureType',      labelZh:'结构类型',   labelEn:'Structure Type',        labelRu:'Тип конструкции',         type:'text'},
{key:'infrastructure',     labelZh:'现有设施',   labelEn:'Infrastructure',        labelRu:'Инфраструктура',          type:'text'},
{key:'crops',              labelZh:'种植作物',   labelEn:'Crops',                 labelRu:'Культуры',                type:'text'},
{key:'scope',              labelZh:'项目范围',   labelEn:'Project Scope',         labelRu:'Объем проекта',           type:'textarea'},
]},
];

// Helper: get label for a field key in current language
function fieldLabel(key, lang) {
  const idxMap = {zh:'labelZh', en:'labelEn', ru:'labelRu'};
  const labelKey = idxMap[lang] || 'labelZh';
  for (const g of FIELD_GROUPS) {
    for (const f of g.fields) {
      if (f.key === key) return f[labelKey];
    }
  }
  return key;
}

// Helper: get group title in current language
function groupTitle(group, lang) {
  const idxMap = {zh:'titleZh', en:'titleEn', ru:'titleRu'};
  return group[idxMap[lang] || 'titleZh'];
}

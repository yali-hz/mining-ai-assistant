'use strict';

const { Router } = require('express');


// ===============================
// Entity 字段白名单
// ===============================

const ENTITY_FIELDS = {

  enterprise: [
    'enterprise_name',
    'credit_code',
    'enterprise_type',
    'business_status'
  ],


  mine: [
    'mine_name',
    'mine_area_km2',
    'mine_scale',
    'production_scale',
    'production_scale_unit',
    'development_status',
    'mining_methods',
    'mineral_types',
    'mining_license_no',
    'valid_from',
    'valid_to'
  ],


  production_line: [
    'production_line_name',
    'design_capacity',
    'capacity_unit',
    'production_process',
    'product_types',
    'production_start_date',
    'production_end_date'
  ]

};


// ===============================
// 关系配置
// ===============================

const RELATIONS = {

  enterprise: {
    mine: {
      table: 'mine',
      foreignKey: 'enterprise_id',
      idField: 'mine_id',
      nameField: 'mine_name'
    },

    production_line: {
      table: 'production_line',
      foreignKey: 'enterprise_id',
      idField: 'production_line_id',
      nameField: 'production_line_name'
    }
  },


  mine: {

    enterprise: {
      table: 'enterprise',
      foreignKey: 'enterprise_id',
      idField: 'enterprise_id',
      nameField: 'enterprise_name'
    },


    production_line: {
      table: 'production_line',
      foreignKey: 'mine_id',
      idField: 'production_line_id',
      nameField: 'production_line_name'
    }

  },


  production_line: {

    mine: {
      table: 'mine',
      foreignKey: 'mine_id',
      idField: 'mine_id',
      nameField: 'mine_name'
    },


    enterprise: {
      table: 'enterprise',
      foreignKey: 'enterprise_id',
      idField: 'enterprise_id',
      nameField: 'enterprise_name'
    }

  }

};



class QueryError extends Error {

  constructor(status, code, message, details) {

    super(message);

    Object.assign(this, {
      status,
      code,
      details
    });

  }

}


const fail = (status, code, message, details) => {

  throw new QueryError(
    status,
    code,
    message,
    details
  );

};



function text(value, name) {

  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 200 ||
    /[\x00-\x1f]/.test(value)
  ) {

    fail(
      400,
      'INVALID_PARAMETER',
      `${name} 必须是非空字符串，最长200字符`
    );

  }


  return value.trim();

}



// ===============================
// 参数校验
// ===============================

function validate(body) {


  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body)
  ) {

    fail(
      400,
      'INVALID_PARAMETER',
      '请求体必须是JSON对象'
    );

  }


  const p = { ...body };


  if (!Object.hasOwn(ENTITY_FIELDS, p.entity_type)) {

    fail(
      400,
      'INVALID_PARAMETER',
      'entity_type 仅支持 enterprise / mine / production_line'
    );

  }


  p.entity_keyword = text(
    p.entity_keyword,
    'entity_keyword'
  );



  if (p.resource_type === 'entity') {


    if (
      !['attribute', 'profile']
      .includes(p.query_intent)
    ) {

      fail(
        400,
        'UNSUPPORTED_QUERY',
        '实体查询仅支持 attribute/profile'
      );

    }



    if (
      p.query_intent === 'attribute' &&
      !ENTITY_FIELDS[p.entity_type]
      .includes(p.requested_field)
    ) {

      fail(
        400,
        'UNSUPPORTED_QUERY',
        '属性字段不支持'
      );

    }


  }



  else if (p.resource_type === 'relation') {


    if (
      !RELATIONS[p.entity_type] ||
      !RELATIONS[p.entity_type][p.target_type]
    ) {

      fail(
        400,
        'UNSUPPORTED_QUERY',
        '不支持该实体关系'
      );

    }


    if (
      !['list','count']
      .includes(p.query_intent)
    ) {

      fail(
        400,
        'UNSUPPORTED_QUERY',
        '关系查询仅支持list/count'
      );

    }


  }



  else if (p.resource_type === 'report') {


    if (
      p.query_intent !== 'status'
    ) {

      fail(
        400,
        'UNSUPPORTED_QUERY',
        '报告查询仅支持status'
      );

    }


    if (
      !['status','submitted_at','due_date']
      .includes(p.requested_field)
    ) {

      fail(
        400,
        'UNSUPPORTED_QUERY',
        '报告字段不支持'
      );

    }


    if (
      !Number.isInteger(p.year)
    ) {

      fail(
        400,
        'MISSING_YEAR',
        '请提供报告年度'
      );

    }


    p.report_type_name =
      text(
        p.report_type_name,
        'report_type_name'
      );


  }


  else {

    fail(
      400,
      'UNSUPPORTED_QUERY',
      'resource_type 仅支持 entity/relation/report'
    );

  }


  return p;

}



// ===============================
// CloudBase Client
// ===============================

function createClient(env, fetchImpl, signal) {


  let base;


  try {

    base = new URL(
      env.CLOUDBASE_BASE_URL
    );

  } catch {}


  if (
    !base ||
    !env.CLOUDBASE_TOKEN
  ) {

    fail(
      503,
      'CLOUDBASE_NOT_CONFIGURED',
      '请配置CLOUDBASE_BASE_URL和TOKEN'
    );

  }



  return async function read(table, params) {


    const url = new URL(
      `${base.href.replace(/\/$/,'')}/${table}`
    );


    Object.entries(params)
      .forEach(([k,v])=>{
        url.searchParams.set(
          k,
          String(v)
        );
      });



    const response =
      await fetchImpl(
        url,
        {
          headers:{
            Authorization:
              `Bearer ${env.CLOUDBASE_TOKEN}`,
            Accept:'application/json'
          }
        }
      );


    if (!response.ok) {

      fail(
        502,
        'CLOUDBASE_ERROR',
        'CloudBase查询失败'
      );

    }


    return await response.json();

  };

}



// ===============================
// Router
// ===============================

function createBusinessRouter(env, fetchImpl) {


  const router = Router();



  router.post('/', async(req,res)=>{


    try {


      const p =
        validate(req.body);



      const read =
        createClient(
          env,
          fetchImpl,
          AbortSignal.timeout(15000)
        );



      const idField =
        `${p.entity_type}_id`;

      const nameField =
        `${p.entity_type}_name`;



      const entityRows =
        await read(
          p.entity_type,
          {
            select:
              `${idField},${nameField}`,
            [`${nameField}`]:
              `ilike.*${p.entity_keyword}*`
          }
        );



      if (!entityRows.length) {

        fail(
          404,
          'ENTITY_NOT_FOUND',
          '未找到匹配实体'
        );

      }



      const row =
        entityRows[0];



      const entity = {

        type:p.entity_type,

        id:row[idField],

        name:row[nameField]

      };



      let data;



      // entity

      if (
        p.resource_type === 'entity'
      ) {


        if (
          p.query_intent === 'profile'
        ) {


          const fields =
            ENTITY_FIELDS[p.entity_type];


          const rows =
            await read(
              p.entity_type,
              {
                select:
                  fields.join(','),
                [nameField]:
                  `eq.${entity.name}`
              }
            );


          data =
            rows[0] || {};

        }


        else {


          const rows =
            await read(
              p.entity_type,
              {
                select:
                  p.requested_field,
                [nameField]:
                  `eq.${entity.name}`
              }
            );


          data = {

            [p.requested_field]:
              rows[0]?.[p.requested_field] ?? null

          };


        }

      }



      // relation

      else if (
        p.resource_type === 'relation'
      ) {


        const relation =
          RELATIONS
          [p.entity_type]
          [p.target_type];


        const rows =
          await read(
            relation.table,
            {
              select:
                `${relation.idField},${relation.nameField}`,
              [relation.foreignKey]:
                `eq.${entity.id}`
            }
          );



        data =
          p.query_intent === 'count'
          ?
          {
            count:rows.length
          }
          :
          {
            count:rows.length,
            items:rows
          };


      }



      // report

      else {


        const records =
          await read(
            'report_upload_record',
            {
              select:
              'record_id,year,report_type_name,status,submitted_at,due_date,is_overdue',

              object_type:
                `eq.${entity.type}`,

              object_id:
                `eq.${entity.id}`,

              year:
                `eq.${p.year}`,

              report_type_name:
                `eq.${p.report_type_name}`
            }
          );



        data={

          year:p.year,

          report_type_name:
            p.report_type_name,

          record_found:
            records.length===1,

          status:
            records[0]?.status ?? 'unknown',

          submitted_at:
            records[0]?.submitted_at ?? null,

          due_date:
            records[0]?.due_date ?? null,

          is_overdue:
            records[0]?.is_overdue ?? null

        };

      }



      res.json({

        success:true,

        entity,

        data

      });



    }

    catch(err){


      const known =
        err instanceof QueryError;


      res.status(
        known ? err.status : 500
      )
      .json({

        success:false,

        error:{

          code:
            known
            ? err.code
            :'INTERNAL_ERROR',

          message:
            known
            ? err.message
            :'服务内部错误'

        }

      });

    }


  });



  return router;

}



module.exports={
  createBusinessRouter
};
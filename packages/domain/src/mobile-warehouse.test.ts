import assert from "node:assert/strict";
import { test } from "node:test";
import { warehouseOperationCommandSchema } from "./mobile-warehouse";
import { decideMaterialRequestSourcesSchema } from "./material-requests";
const id="10000000-0000-0000-0000-000000000001",line="20000000-0000-0000-0000-000000000001";
test("warehouse sourcing accepts explicit splits and rejects invalid warehouse quantities",()=>{
 const input={idempotencyKey:id,requestId:id,reason:"",allocations:{[line]:[{warehouseId:id,quantity:"0.1250"}]}};
 assert.equal(decideMaterialRequestSourcesSchema.safeParse(input).success,true);
 for(const quantity of ["0","-1","1e3","0.00001","NaN"]) assert.equal(decideMaterialRequestSourcesSchema.safeParse({...input,allocations:{[line]:[{warehouseId:id,quantity}]}}).success,false);
});
test("native receiving requires accepted quantities and a reason for rejection and strips financial input",()=>{
 const input={action:"receive",warehouseId:id,idempotencyKey:id,orderId:id,lineId:line,deliveredQuantity:"5",acceptedQuantity:"4",qualityNote:"One damaged",deliveryReference:"DR-1",inspectedOn:"2026-11-10",goodsTotalCost:"1"};
 const parsed=warehouseOperationCommandSchema.parse(input);assert.equal("goodsTotalCost" in parsed,false);
 assert.equal(warehouseOperationCommandSchema.safeParse({...input,acceptedQuantity:"5",qualityNote:"a"}).success,false);
 assert.equal(warehouseOperationCommandSchema.safeParse({...input,acceptedQuantity:"6"}).success,false);
 assert.equal(warehouseOperationCommandSchema.safeParse({...input,qualityNote:""}).success,false);
 assert.equal(warehouseOperationCommandSchema.safeParse({...input,acceptedQuantity:"0",qualityNote:"All wet"}).success,true);
});
test("native release needs a vehicle or transport description and delivery evidence",()=>{
 const input={action:"release",warehouseId:id,idempotencyKey:id,allocationId:line,quantity:"2",transactionDate:"2026-11-10",remarks:"",vehicleAssetId:"",vehicleLabel:"Truck",driverName:"Driver",deliveryReference:"TRIP-1"};
 assert.equal(warehouseOperationCommandSchema.safeParse(input).success,true);
 for(const change of [{vehicleLabel:""},{driverName:""},{deliveryReference:""},{quantity:"-1"}])assert.equal(warehouseOperationCommandSchema.safeParse({...input,...change}).success,false);
});

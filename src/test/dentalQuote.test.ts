import { describe, it, expect } from "vitest";
import { calculateDentalQuote } from "../lib/dentalQuote";
const line = {id:"a",label:"Dévitalisation molaire",tooth:"36",quantity:1,unitPrice:45000};
describe("dental proforma pricing",()=>{
 it("handles discounts then insurance without charging twice",()=>{
  expect(calculateDentalQuote([line],10,80)).toEqual({subtotal:45000,discount:4500,net:40500,insurance:32400,patientDue:8100});
 });
 it("caps reductions and coverage at 100%",()=>{expect(calculateDentalQuote([line],500,500).patientDue).toBe(0)});
 it("does not allow negative quantities or prices",()=>{expect(calculateDentalQuote([{...line,quantity:-2,unitPrice:-50}],0,0).subtotal).toBe(0)});
 it("supports a blank quote",()=>{expect(calculateDentalQuote([],0,0).patientDue).toBe(0)});
});

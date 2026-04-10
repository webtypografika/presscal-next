import { prisma } from '@/lib/db';
import { NextRequest } from 'next/server';
import { calcImposition } from '@/lib/calc/imposition';
import { calculateCost } from '@/lib/calc/cost';
import type { CalculatorInput } from '@/types/calculator';
import type { DigitalSpecs, OffsetSpecs } from '@/types/machine';
import type { ImpositionInput, PrintableArea } from '@/lib/calc/imposition';
import type { CostInput } from '@/lib/calc/cost';

const ORG_ID = 'default-org';

// ─── MAP DB SPECS → TypeScript interfaces ───
// DB stores flat keys (toner_c_cost, off_towers) from wizard
// Cost engine expects nested TypeScript interface (tonerC: {cost, yield})

function mapDigitalSpecs(raw: Record<string, unknown>): DigitalSpecs {
  return {
    costMode: ((raw.cost_mode as string) || 'simple_in') as DigitalSpecs['costMode'],
    colorStations: (raw.color_stations as number) || 4,
    consumableType: (raw.consumable_type as string) === 'ink' ? 'ink' : 'toner',
    duplexClickMultiplier: (raw.duplex_click_multiplier as number) || 2,

    clickA4Color: (raw.click_a4_color as number) || undefined,
    clickA4Bw: (raw.click_a4_bw as number) || undefined,
    clickA3Color: (raw.click_a3_color as number) || undefined,
    clickA3Bw: (raw.click_a3_bw as number) || undefined,
    clickBannerColor: (raw.click_banner_color as number) || undefined,
    clickBannerBw: (raw.click_banner_bw as number) || undefined,

    tonerC: raw.toner_c_cost ? { cost: raw.toner_c_cost as number, yield: (raw.toner_c_yield as number) || 1 } : undefined,
    tonerM: raw.toner_m_cost ? { cost: raw.toner_m_cost as number, yield: (raw.toner_m_yield as number) || 1 } : undefined,
    tonerY: raw.toner_y_cost ? { cost: raw.toner_y_cost as number, yield: (raw.toner_y_yield as number) || 1 } : undefined,
    tonerK: raw.toner_k_cost ? { cost: raw.toner_k_cost as number, yield: (raw.toner_k_yield as number) || 1 } : undefined,

    drumC: raw.drum_c_cost ? { cost: raw.drum_c_cost as number, yield: (raw.drum_c_life as number) || 1 } : undefined,
    drumM: raw.drum_m_cost ? { cost: raw.drum_m_cost as number, yield: (raw.drum_m_life as number) || 1 } : undefined,
    drumY: raw.drum_y_cost ? { cost: raw.drum_y_cost as number, yield: (raw.drum_y_life as number) || 1 } : undefined,
    drumK: raw.drum_k_cost ? { cost: raw.drum_k_cost as number, yield: (raw.drum_k_life as number) || 1 } : undefined,

    developerType: (raw.developer_type as string) === 'integrated' ? 'integrated' : 'separate',
    developerC: raw.dev_c_cost ? { cost: raw.dev_c_cost as number, yield: (raw.dev_c_life as number) || 1 } : undefined,
    developerM: raw.dev_m_cost ? { cost: raw.dev_m_cost as number, yield: (raw.dev_m_life as number) || 1 } : undefined,
    developerY: raw.dev_y_cost ? { cost: raw.dev_y_cost as number, yield: (raw.dev_y_life as number) || 1 } : undefined,
    developerK: raw.dev_k_cost ? { cost: raw.dev_k_cost as number, yield: (raw.dev_k_life as number) || 1 } : undefined,

    hasChargeCoronas: !!raw.has_charge_coronas,
    coronaCost: (raw.corona_cost as number) || undefined,
    coronaLife: (raw.corona_life as number) || undefined,

    fuserCost: (raw.fuser_cost as number) || undefined,
    fuserLife: (raw.fuser_life as number) || undefined,
    beltCost: (raw.belt_cost as number) || undefined,
    beltLife: (raw.belt_life as number) || undefined,
    wasteCost: (raw.waste_cost as number) || undefined,
    wasteLife: (raw.waste_life as number) || undefined,

    speedPpmColor: (raw.speed_ppm_color as number) || undefined,
    speedPpmBw: (raw.speed_ppm_bw as number) || undefined,
    speedZones: raw.speed_zones as DigitalSpecs['speedZones'],
  };
}

function mapOffsetSpecs(raw: Record<string, unknown>): OffsetSpecs {
  return {
    towers: (raw.off_towers as number) || 4,
    speed: (raw.off_common_speed as number) || (raw.off_speed as number) || 5000,
    perfecting: !!raw.off_perfecting,
    hasVarnishTower: !!raw.off_has_varnish_tower,
    varnishType: (raw.off_varnish_type as OffsetSpecs['varnishType']) || undefined,
    defaultWaste: (raw.off_default_waste as number) || 50,
    wastePercent: (raw.registration_spoilage_pct as number) || 2,
    plateCost: (raw.off_plate_c as number) || 0,
    includePlates: raw.off_include_parts !== false,
    blanketCost: (raw.off_blanket_c as number) || 0,
    blanketLife: (raw.off_blanket_life as number) || 50000,
    inkGm2: (raw.off_ink_gm2 as number) || 1.5,
    inkPricePerKg: undefined, // set after from consumables
    rollerCount: (raw.off_roller_count as number) || undefined,
    rollerCost: (raw.off_roller_recover_c as number) || undefined,
    rollerLife: (raw.off_roller_recover_life as number) || undefined,
    washPassesPerRun: raw.off_wash_min ? 1 : 0,
    inkCleanerCpl: (raw.chem_wash_ink_c as number) || undefined,
    waterCleanerCpl: (raw.chem_wash_water_c as number) || undefined,
    washMlPerLiter: (raw.off_chem_wash_ml as number) || undefined,
    ipaMlPerHour: undefined, // auto-calculated from machine format + towers
    ipaCpl: (raw.chem_alcohol_c as number) || undefined, // fallback, overridden by consumable
    varnishGm2: (raw.off_varnish_gm2 as number) || undefined,
    coatingGm2: (raw.off_coating_gm2 as number) || undefined,
    coatingPricePerKg: (raw.off_coating_c as number) || undefined,
    hourCost: (raw.off_hour_c as number) || 0,
    setupMin: (raw.off_setup_min as number) || 15,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body: CalculatorInput = await req.json();

    // ─── FETCH MACHINE ───
    const machine = await prisma.machine.findFirst({
      where: { id: body.machineId, orgId: ORG_ID, deletedAt: null },
      include: { consumables: { where: { deletedAt: null } } },
    });
    if (!machine) {
      return Response.json({ error: 'Μηχανή δεν βρέθηκε' }, { status: 404 });
    }

    // ─── FETCH PAPER ───
    const paper = await prisma.material.findFirst({
      where: { id: body.paperId, orgId: ORG_ID, deletedAt: null },
    });
    if (!paper) {
      return Response.json({ error: 'Χαρτί δεν βρέθηκε' }, { status: 404 });
    }

    // ─── FETCH FINISHING MACHINES ───
    let guillotineData: CostInput['guillotine'] | undefined;
    if (body.guillotineId) {
      const guill = await prisma.postpressMachine.findFirst({
        where: { id: body.guillotineId, orgId: ORG_ID, deletedAt: null },
      });
      if (guill) {
        const gSpecs = (guill.specs as Record<string, number>) || {};
        guillotineData = {
          // 4-channel charge rates
          ratePerCut: gSpecs.rate_per_cut,
          rateWeight: gSpecs.rate_weight,
          ratePerStack: gSpecs.rate_per_stack,
          ratePerMinute: gSpecs.rate_per_minute,
          // 3-pass model specs
          liftH: gSpecs.lift_h || 8,
          secsPerCut: gSpecs.secs_per_cut || 20,
          secsPerStack: gSpecs.secs_per_stack || 90,
          trimCuts: 4,
          // Cost fields
          setupCost: guill.setupCost || 0,
          sharpPrice: gSpecs.sharp_price,
          bladeLife: gSpecs.blade_life || 2000,
          hourlyCost: gSpecs.hourly_cost,
          minCharge: guill.minCharge || 0,
          // Quantity discount
          discountStep: gSpecs.discount_step,
          discountPct: gSpecs.discount_pct,
          discountMax: gSpecs.discount_max,
        };
      }
    }

    let lamData: CostInput['lamination'] | undefined;
    const lamWarnings: string[] = [];
    if (body.lamMachineId && body.lamFilmId) {
      const lamMachine = await prisma.postpressMachine.findFirst({
        where: { id: body.lamMachineId, orgId: ORG_ID, deletedAt: null },
      });
      const lamFilm = await prisma.material.findFirst({
        where: { id: body.lamFilmId, orgId: ORG_ID, deletedAt: null },
      });
      if (lamMachine && lamFilm) {
        const lSpecs = (lamMachine.specs as Record<string, number>) || {};
        const fSpecs = (lamFilm.specs as Record<string, number>) || {};
        // Pouch = film has both width and height dimensions
        const isPouch = !!(lamFilm.width && lamFilm.height && lamFilm.cat === 'film');
        const maxW = lSpecs.max_w || 0;

        if (isPouch) {
          // Pouch lamination — cost per piece from film (package cost / qty per package)
          const pouchW = lamFilm.width || 0;
          const pouchH = lamFilm.height || 0;
          const sealMargin = lSpecs.seal_margin ?? 5;
          const pouchCostPerPiece = lamFilm.costPerUnit || 0;

          // Validate: sheet must fit inside pouch minus seal margins
          const maxSheetW = pouchW - sealMargin * 2;
          const maxSheetH = pouchH - sealMargin * 2;
          if (body.jobW > maxSheetW || body.jobH > maxSheetH) {
            const fitRotated = body.jobH <= maxSheetW && body.jobW <= maxSheetH;
            if (!fitRotated) {
              lamWarnings.push(`Το φύλλο ${body.jobW}×${body.jobH}mm δεν χωράει στο pouch ${pouchW}×${pouchH}mm (περιθώριο ${sealMargin}mm/πλευρά, μέγιστο ${maxSheetW}×${maxSheetH}mm)`);
            }
          }

          lamData = {
            mode: 'pouch',
            filmCostPerSqm: 0,
            machineSetupCost: lamMachine.setupCost || 0,
            sides: 1,
            pouchCostPerPiece,
            pouchSellPerPiece: lamFilm.sellPerUnit || undefined,
            pouchW,
            pouchH,
            sealMargin,
            maxW,
          };
        } else {
          // Roll lamination — film cost per m² from roll specs
          // Film: costPerUnit = cost per m², or calculated from roll price/length/width
          let filmCostPerSqm = lamFilm.costPerUnit || 0;
          // If film is a roll with rollLength and width, calculate €/m²
          if (lamFilm.cat === 'roll' && lamFilm.rollLength && lamFilm.width) {
            const rollAreaSqm = (lamFilm.width / 1000) * lamFilm.rollLength; // width(mm→m) × length(m)
            filmCostPerSqm = (fSpecs.roll_price || lamFilm.costPerUnit || 0) / rollAreaSqm;
          }
          const dualRoll = !!(lSpecs.dual_roll);

          // Validate: sheet width must fit machine opening
          if (maxW > 0) {
            const sheetSS = Math.min(body.jobW || 0, body.jobH || 0);
            // The machine sheet (not trim) goes through the laminator
            // We'll warn based on machine paper size vs laminator opening
            // (checked at UI level too)
          }

          // Sell price per m²: from material or derive from markup
          let filmSellPerSqm: number | undefined;
          if (lamFilm.sellPerUnit && lamFilm.sellPerUnit > 0) {
            // If material is a roll, sellPerUnit was stored as €/m²
            filmSellPerSqm = lamFilm.sellPerUnit;
            // But if stored as per-roll sell, recalculate
            if (lamFilm.cat === 'roll' && lamFilm.rollLength && lamFilm.width) {
              // sellPerUnit is already €/m² (set during material creation)
              filmSellPerSqm = lamFilm.sellPerUnit;
            }
          }

          lamData = {
            mode: 'roll',
            filmCostPerSqm,
            filmSellPerSqm,
            machineSetupCost: lamMachine.setupCost || 0,
            sides: body.lamSides || 1,
            dualRoll,
            maxW,
          };
        }
      }
    }

    let bindData: CostInput['binding'] | undefined;
    if (body.bindingType && body.bindingMachineId) {
      const bindMachine = await prisma.postpressMachine.findFirst({
        where: { id: body.bindingMachineId, orgId: ORG_ID, deletedAt: null },
      });
      if (bindMachine) {
        const bSpecs = (bindMachine.specs as Record<string, number>) || {};
        // staple has price_booklet / price_pad; glue_bind & spiral have price_per_unit
        const isBookletMode = body.impositionMode === 'booklet';
        const pricePerUnit = bSpecs.price_booklet && isBookletMode
          ? bSpecs.price_booklet
          : bSpecs.price_pad || bSpecs.price_per_unit || bSpecs.costPerUnit || 0;
        // Discount logic (same pattern as guillotine)
        let discount = 0;
        if (bSpecs.discount_step && bSpecs.discount_pct && body.qty > bSpecs.discount_step) {
          const steps = Math.floor(body.qty / bSpecs.discount_step);
          discount = Math.min(steps * bSpecs.discount_pct, bSpecs.discount_max || 100);
        }
        const effectivePrice = pricePerUnit * (1 - discount / 100);
        bindData = {
          type: body.bindingType as 'staple' | 'glue' | 'spiral',
          pricePerUnit: effectivePrice,
          setupCost: bindMachine.setupCost || 0,
          minCharge: bindMachine.minCharge || 0,
        };
      }
    }

    // ─── FETCH PRODUCT (optional) ───
    let productPricing: Record<string, unknown> | null = null;
    if (body.productId) {
      const product = await prisma.product.findFirst({
        where: { id: body.productId, orgId: ORG_ID, deletedAt: null },
      });
      if (product) {
        const macCat = machine.cat;
        if (macCat === 'offset' || macCat === 'digital') {
          const pData = (macCat === 'offset' ? product.offset : product.digital) as Record<string, unknown> || {};
          productPricing = { ...pData, archetype: product.archetype, name: product.name };
        }
      }
    }

    // ─── BUILD SPECS ───
    const rawSpecs = (machine.specs as Record<string, unknown>) || {};
    const machineCat = machine.cat as 'digital' | 'offset';
    const machineSpecs: DigitalSpecs | OffsetSpecs = machineCat === 'offset'
      ? mapOffsetSpecs(rawSpecs)
      : mapDigitalSpecs(rawSpecs);

    // ─── SYNC CONSUMABLE PRICES FROM WAREHOUSE (live, not cached specs) ───
    if (machine.consumables?.length) {
      const cons = machine.consumables;
      const findCon = (type: string, color?: string) => {
        return cons.find(c => c.conType === type && (!color || c.color === color));
      };
      const cy = (c: typeof cons[0] | undefined): { cost: number; yield: number } | undefined => {
        if (!c) return undefined;
        const cost = (c.costPerBase || c.costPerUnit || 0) as number;
        const yld = (c.yieldPages || 0) as number;
        return cost > 0 && yld > 0 ? { cost, yield: yld } : undefined;
      };

      if (machineCat === 'digital') {
        const ds = machineSpecs as unknown as Record<string, unknown>;
        // Toner
        const tc = cy(findCon('toner', 'cyan')); if (tc) { ds.tonerC = tc; }
        const tm = cy(findCon('toner', 'magenta')); if (tm) { ds.tonerM = tm; }
        const ty = cy(findCon('toner', 'yellow')); if (ty) { ds.tonerY = ty; }
        const tk = cy(findCon('toner', 'black')); if (tk) { ds.tonerK = tk; }
        // Drums
        const dc = cy(findCon('drum', 'cyan')); if (dc) { ds.drumC = dc; }
        const dm = cy(findCon('drum', 'magenta')); if (dm) { ds.drumM = dm; }
        const dmy = cy(findCon('drum', 'yellow')); if (dmy) { ds.drumY = dmy; }
        const dk = cy(findCon('drum', 'black')); if (dk) { ds.drumK = dk; }
        // Developer
        const devc = cy(findCon('developer', 'cyan')); if (devc) { ds.developerC = devc; }
        const devm = cy(findCon('developer', 'magenta')); if (devm) { ds.developerM = devm; }
        const devy = cy(findCon('developer', 'yellow')); if (devy) { ds.developerY = devy; }
        const devk = cy(findCon('developer', 'black')); if (devk) { ds.developerK = devk; }
        // Shared consumables
        const fuser = cy(findCon('fuser')); if (fuser) { ds.fuserCost = fuser.cost; ds.fuserLife = fuser.yield; }
        const belt = cy(findCon('belt')); if (belt) { ds.beltCost = belt.cost; ds.beltLife = belt.yield; }
        const waste = cy(findCon('waste')); if (waste) { ds.wasteCost = waste.cost; ds.wasteLife = waste.yield; }
        const corona = cy(findCon('corona')); if (corona) { ds.coronaCost = corona.cost; ds.coronaLife = corona.yield; }
      } else {
        // Offset: ink, plates, blankets, chemicals
        const os = machineSpecs as unknown as Record<string, unknown>;
        // Ink price (average €/kg)
        const inks = cons.filter(c => c.conType === 'ink' && c.conModule === 'offset');
        if (inks.length > 0) {
          const prices = inks.map(c => ((c.costPerBase || c.costPerUnit || 0) as number)).filter(p => p > 0);
          if (prices.length > 0) os.inkPricePerKg = prices.reduce((a, b) => a + b, 0) / prices.length;
        }
        // Plates
        const plate = findCon('plate'); if (plate) { const p = (plate.costPerBase || plate.costPerUnit || 0) as number; if (p > 0) os.plateCost = p; }
        // Blanket
        const blanket = findCon('blanket');
        if (blanket) {
          const bc = (blanket.costPerBase || blanket.costPerUnit || 0) as number;
          const bl = (blanket.yieldPages || 0) as number;
          if (bc > 0) os.blanketCost = bc;
          if (bl > 0) os.blanketLife = bl;
        }
        // Chemicals
        const chems = cons.filter(c => c.conType === 'chemical');
        for (const c of chems) {
          // Cost per liter: prefer costPerUnit/unitSize (e.g. €56/30lt), fallback to costPerBase (already per liter)
          const unitSize = (c.unitSize as number) || 0;
          const cpl = unitSize > 0 && (c.costPerUnit as number) > 0
            ? (c.costPerUnit as number) / unitSize
            : ((c.costPerBase || 0) as number);
          if (cpl <= 0) continue;
          const name = ((c.name as string) || '').toLowerCase();
          if (name.includes('wash') && name.includes('ink') || name.includes('mrc')) os.inkCleanerCpl = cpl;
          else if (name.includes('wash') && name.includes('water') || name.includes('hpl')) os.waterCleanerCpl = cpl;
          else if (name.includes('alcohol') || name.includes('ipa') || name.includes('isopropyl')) os.ipaCpl = cpl;
        }
        // If no IPA consumable found on machine, look in warehouse
        if (!chems.some(c => {
          const n = ((c.name as string) || '').toLowerCase();
          return n.includes('alcohol') || n.includes('ipa') || n.includes('isopropyl');
        })) {
          const warehouseIpa = await prisma.consumable.findFirst({
            where: {
              orgId: ORG_ID, deletedAt: null, conType: 'chemical',
              name: { contains: 'ipa', mode: 'insensitive' },
            },
            select: { costPerBase: true, costPerUnit: true, unitSize: true },
          }) || await prisma.consumable.findFirst({
            where: {
              orgId: ORG_ID, deletedAt: null, conType: 'chemical',
              name: { contains: 'alcohol', mode: 'insensitive' },
            },
            select: { costPerBase: true, costPerUnit: true, unitSize: true },
          });
          if (warehouseIpa) {
            const us = (warehouseIpa.unitSize as number) || 0;
            const wCpl = us > 0 && (warehouseIpa.costPerUnit as number) > 0
              ? (warehouseIpa.costPerUnit as number) / us
              : ((warehouseIpa.costPerBase || 0) as number);
            if (wCpl > 0) os.ipaCpl = wCpl;
          }
        }
      }
    }

    // ─── IMPOSITION ───
    // Normalize: LS = always long side, SS = always short side
    const dimA = body.machineSheetW || machine.maxLS || 330;
    const dimB = body.machineSheetH || machine.maxSS || 487;
    const rawW = Math.max(dimA, dimB); // LS (long side)
    const rawH = Math.min(dimA, dimB); // SS (short side)
    // Canvas: left edge = feed side. LEF: long enters → portrait (W=SS, H=LS). SEF: short enters → landscape (W=LS, H=SS).
    const isLEF = body.feedEdge === 'lef';
    // Feed length = dimension parallel to drum (vizW). LEF: SS, SEF: LS.
    const feedLength = isLEF ? rawH : rawW;
    const area: PrintableArea = {
      paperW: isLEF ? rawH : rawW,  // LEF: SS wide, SEF: LS wide
      paperH: isLEF ? rawW : rawH,  // LEF: LS tall, SEF: SS tall
      // Offset: DB marginTop=gripper(bottom), marginBottom=tail(top) → swap for visual layout
      marginTop: machineCat === 'offset' ? (machine.marginBottom || 0) : (machine.marginTop || 0),
      marginBottom: machineCat === 'offset' ? (machine.marginTop || 0) : (machine.marginBottom || 0),
      marginLeft: machine.marginLeft || 0,
      marginRight: machine.marginRight || 0,
    };

    const impoInput: ImpositionInput = {
      mode: body.impositionMode,
      trimW: body.jobW,
      trimH: body.jobH,
      bleed: body.bleed,
      qty: body.qty,
      sides: body.sides,
      gutter: body.impoGutter || 0,
      area,
      forceUps: body.impoForceUps,
      forceCols: body.impoForceCols,
      forceRows: body.impoForceRows,
      rotation: body.impoRotation,
      turnType: body.impoTurnType,
      pages: body.pages || undefined,
      paperThickness: body.paperThickness || undefined,
    };

    const imposition = calcImposition(impoInput);


    // ─── COST ───
    const costInput: CostInput = {
      machineCat,
      machineMaxW: area.paperW,
      machineMaxH: area.paperH,
      specs: machineSpecs,
      tacLimit: ((rawSpecs.tac_limit as number) || 280) / 100,  // convert % to fraction
      feedEdge: (body.feedEdge as 'sef' | 'lef' | undefined) ?? ((rawSpecs.feed_direction as string) === 'lef' ? 'lef' : 'sef'),
      machineMaxDim: Math.max(machine.maxLS || 0, machine.maxSS || 0),  // machine's absolute max for drum threshold
      feedLength,  // pre-computed: how far paper travels (mm)
      includeDepreciation: !!rawSpecs.include_depreciation,
      machineCost: (rawSpecs.machine_cost as number) || undefined,
      machineLifetimePasses: (rawSpecs.machine_lifetime_passes as number) || undefined,

      paperW: paper.width || 860,
      paperH: paper.height || 610,
      paperCostPerUnit: paper.costPerUnit || 0,
      paperGsm: paper.thickness || 80,

      qty: body.qty,
      sides: body.sides,
      colorMode: body.colorMode,
      wasteFixed: body.wasteFixed ?? 0,
      coverageLevel: body.coverageLevel,
      coveragePdf: body.coveragePdf,

      imposition,

      guillotine: guillotineData,
      lamination: lamData,
      binding: bindData,

      paperMarkup: paper.markup ?? 0,       // from material (αποθήκη)
      printMarkup: 0,                       // pricing via products only
      guillotineMarkup: 0,
      lamMarkup: 0,
      bindingMarkup: 0,
      minChargePrint: undefined,
      minChargeGuillotine: undefined,
      minChargeLam: undefined,
      minChargeBinding: undefined,

      offsetFrontCmyk: body.offsetFrontCmyk,
      offsetBackCmyk: body.offsetBackCmyk,
      offsetFrontPms: body.offsetFrontPms,
      offsetBackPms: body.offsetBackPms,
      offsetOilVarnish: body.offsetOilVarnish,
      productPricing: productPricing ? {
        charge_per_color: productPricing.charge_per_color as number,
        extra_pantone: productPricing.extra_pantone as number,
        extra_varnish: productPricing.extra_varnish as number,
        hourly_enabled: productPricing.hourly_enabled as boolean,
        hourly_rate: productPricing.hourly_rate as number,
        price_color: productPricing.price_color as number,
        price_bw: productPricing.price_bw as number,
        discount_enabled: productPricing.discount_enabled as boolean,
        discount_step_qty: productPricing.discount_step_qty as number,
        discount_step_pct: productPricing.discount_step_pct as number,
        discount_max: productPricing.discount_max as number,
      } : undefined,
      // Overrides
      overrides: body.overrides || undefined,
    };

    const result = calculateCost(costInput);
    if (lamWarnings.length > 0) result.lamWarnings = lamWarnings;

    // Inject debug into result so it's always visible
    (result as any)._dbg = {
      productName: productPricing?.name ?? null,
      offHourlyRate: productPricing?.hourly_rate ?? null,
      offHourlyEnabled: productPricing?.hourly_enabled ?? null,
      speedUsed: (machineSpecs as any).speed ?? null,
    };
    return Response.json({ imposition, result, debug: { machineCat } });
  } catch (err) {
    console.error('Calculator API error:', err);
    return Response.json(
      { error: 'Σφάλμα υπολογισμού' },
      { status: 500 },
    );
  }
}

// ─── MACHINES LIST ───
export async function GET() {
  const [machines, materials, postpress, , products, films] = await Promise.all([
    prisma.machine.findMany({
      where: { orgId: ORG_ID, deletedAt: null },
      select: {
        id: true, name: true, cat: true,
        maxLS: true, maxSS: true,
        marginTop: true, marginBottom: true, marginLeft: true, marginRight: true,
        specs: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.material.findMany({
      where: { orgId: ORG_ID, deletedAt: null, cat: 'sheet' },
      select: {
        id: true, name: true, groupName: true, supplier: true,
        width: true, height: true, thickness: true,
        costPerUnit: true, unit: true,
      },
      orderBy: [{ groupName: 'asc' }, { name: 'asc' }],
    }),
    prisma.postpressMachine.findMany({
      where: { orgId: ORG_ID, deletedAt: null },
      select: {
        id: true, name: true, subtype: true,
        setupCost: true, speed: true, hourlyRate: true, specs: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.profile.findMany({
      where: { orgId: ORG_ID, deletedAt: null },
      select: {
        id: true, name: true, isDefault: true,
        paperMarkup: true, printMarkup: true, guillotineMarkup: true,
        lamMarkup: true, bindingMarkup: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.product.findMany({
      where: { orgId: ORG_ID, deletedAt: null },
      select: {
        id: true, name: true, archetype: true,
        pages: true, sheetsPerPad: true, bodyPages: true, customMult: true,
        offset: true, digital: true, isFavourite: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.material.findMany({
      where: { orgId: ORG_ID, deletedAt: null, cat: { in: ['film', 'roll'] } },
      select: {
        id: true, name: true, groupName: true, cat: true,
        costPerUnit: true, unit: true,
        width: true, height: true, rollLength: true,
        specs: true,
      },
      orderBy: [{ groupName: 'asc' }, { name: 'asc' }],
    }),
  ]);

  const org = await prisma.org.findUnique({ where: { id: ORG_ID }, select: { presskitEnabled: true } });

  return Response.json({ machines, materials, postpress, products, films, presskitEnabled: org?.presskitEnabled ?? false });
}

// ─── PATCH: update machine custom_papers ───
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();

    // Toggle product favourite
    if (body.action === 'toggleFavourite' && body.productId) {
      const product = await prisma.product.findFirst({ where: { id: body.productId, orgId: ORG_ID } });
      if (!product) return Response.json({ error: 'Product not found' }, { status: 404 });
      // Unfavourite all products with same archetype, then toggle this one
      await prisma.product.updateMany({ where: { orgId: ORG_ID, archetype: product.archetype }, data: { isFavourite: false } });
      if (!product.isFavourite) {
        await prisma.product.update({ where: { id: body.productId }, data: { isFavourite: true } });
      }
      return Response.json({ ok: true });
    }

    const { machineId, custom_papers, fav_papers } = body;
    if (!machineId) return Response.json({ error: 'Missing machineId' }, { status: 400 });

    const machine = await prisma.machine.findFirst({
      where: { id: machineId, orgId: ORG_ID, deletedAt: null },
    });
    if (!machine) return Response.json({ error: 'Machine not found' }, { status: 404 });

    const specs = (machine.specs as Record<string, unknown>) || {};
    if (custom_papers !== undefined) specs.custom_papers = custom_papers;
    if (fav_papers !== undefined) specs.fav_papers = fav_papers;

    await prisma.machine.update({
      where: { id: machineId },
      data: { specs: specs as never },
    });

    return Response.json({ ok: true });
  } catch (err) {
    console.error('Calculator PATCH error:', err);
    return Response.json({ error: 'Update failed' }, { status: 500 });
  }
}

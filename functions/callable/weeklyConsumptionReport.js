/**
 * Manual Weekly Consumption Report - Callable Function
 * Ręczne wywołanie generowania raportu analizy konsumpcji MO
 *
 * DEPLOYMENT:
 * firebase deploy --only functions:bgw-mrp:triggerWeeklyConsumptionReport
 */

const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const {admin} = require("../config");

// Definiujemy secret dla klucza API Gemini
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

const triggerWeeklyConsumptionReport = onCall(
    {
      region: "europe-central2",
      memory: "1GiB",
      timeoutSeconds: 540, // 9 minut
      secrets: [GEMINI_API_KEY],
    },
    async (request) => {
      // Sprawdź czy użytkownik jest zalogowany i ma uprawnienia admina
      if (!request.auth) {
        throw new HttpsError(
            "unauthenticated",
            "Musisz być zalogowany, aby wywołać tę funkcję.",
        );
      }

      logger.info(
          "triggerWeeklyConsumptionReport - ręczne wywołanie przez:",
          request.auth.uid,
      );

      const db = admin.firestore();
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      try {
        // ============================================================
        // KROK 1: Pobierz zadania produkcyjne z ostatniego tygodnia
        // ============================================================
        const tasksSnapshot = await db
            .collection("productionTasks")
            .where(
                "updatedAt",
                ">=",
                admin.firestore.Timestamp.fromDate(weekAgo),
            )
            .get();

        const tasks = tasksSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        logger.info(`Pobrano ${tasks.length} zadań z ostatniego tygodnia`);

        // ============================================================
        // KROK 2: Pobierz transakcje magazynowe (ISSUE + RECEIVE)
        // ============================================================
        const [issueSnapshot, receiveSnapshot] = await Promise.all([
          db
              .collection("inventoryTransactions")
              .where("type", "==", "ISSUE")
              .where(
                  "createdAt",
                  ">=",
                  admin.firestore.Timestamp.fromDate(weekAgo),
              )
              .get(),
          db
              .collection("inventoryTransactions")
              .where("type", "==", "RECEIVE")
              .where(
                  "createdAt",
                  ">=",
                  admin.firestore.Timestamp.fromDate(weekAgo),
              )
              .get(),
        ]);

        const issueTransactions = issueSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        const receiveTransactions = receiveSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        logger.info(
            `Transakcje: ${issueTransactions.length} ISSUE, ` +
            `${receiveTransactions.length} RECEIVE`,
        );

        // ============================================================
        // KROK 3: Pobierz OBECNE STANY magazynowe
        // ============================================================
        const inventorySnapshot = await db
            .collection("inventory")
            .where("quantity", ">", 0)
            .get();

        const inventoryItems = inventorySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        logger.info(
            `Pobrano ${inventoryItems.length} pozycji magazynowych z ilością > 0`,
        );

        // ============================================================
        // KROK 4: Pobierz PARTIE - różne kategorie
        // ============================================================
        const expiryThreshold = new Date(
            now.getTime() + 30 * 24 * 60 * 60 * 1000,
        );

        const [
          lowQtyBatchesSnapshot,
          expiringBatchesSnapshot,
          allActiveBatchesSnapshot,
        ] = await Promise.all([
          db
              .collection("inventoryBatches")
              .where("quantity", ">", 0)
              .where("quantity", "<", 10)
              .get(),

          db
              .collection("inventoryBatches")
              .where(
                  "expiryDate",
                  "<=",
                  admin.firestore.Timestamp.fromDate(expiryThreshold),
              )
              .where("quantity", ">", 0)
              .get(),

          db.collection("inventoryBatches").where("quantity", ">", 0).get(),
        ]);

        const lowQuantityBatches = lowQtyBatchesSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        const expiringBatches = expiringBatchesSnapshot.docs
            .filter((doc) => {
              const expiryDate = doc.data().expiryDate?.toDate();
              return expiryDate && expiryDate >= new Date("1971-01-01");
            })
            .map((doc) => ({id: doc.id, ...doc.data()}));

        const allActiveBatches = allActiveBatchesSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        logger.info(
            `Partie: ${lowQuantityBatches.length} niskie, ` +
            `${expiringBatches.length} wygasające, ` +
            `${allActiveBatches.length} aktywne`,
        );

        // ============================================================
        // KROK 5: Pobierz transakcje z ostatniego miesiąca
        // ============================================================
        const monthTransactionsSnapshot = await db
            .collection("inventoryTransactions")
            .where(
                "createdAt",
                ">=",
                admin.firestore.Timestamp.fromDate(monthAgo),
            )
            .get();

        const monthTransactions = monthTransactionsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        // ============================================================
        // KROK 6: Zaawansowana analiza danych
        // ============================================================
        const analysisData = performAdvancedAnalysis({
          tasks,
          issueTransactions,
          receiveTransactions,
          inventoryItems,
          lowQuantityBatches,
          expiringBatches,
          allActiveBatches,
          monthTransactions,
          weekAgo,
          now,
        });

        // ============================================================
        // KROK 7: Generowanie raportu AI z Gemini
        // ============================================================
        const apiKey = GEMINI_API_KEY.value();
        let aiAnalysis = null;

        if (apiKey) {
          aiAnalysis = await generateAIAnalysis(apiKey, analysisData);
        } else {
          logger.warn("Brak klucza API Gemini - pomijam analizę AI");
        }

        // ============================================================
        // KROK 8: Zapisz raport do Firestore
        // ============================================================
        const reportData = {
          generatedAt: admin.firestore.FieldValue.serverTimestamp(),
          periodStart: admin.firestore.Timestamp.fromDate(weekAgo),
          periodEnd: admin.firestore.Timestamp.fromDate(now),
          statistics: analysisData.statistics,
          issues: analysisData.issues,
          consumptionDeviations: analysisData.consumptionDeviations,
          lowQuantityBatches: analysisData.lowQuantityBatches,
          frozenBatches: analysisData.frozenBatches,
          dormantBatches: analysisData.dormantBatches,
          consumptionAnomalies: analysisData.anomalies,
          topConsumedMaterials: analysisData.topConsumedMaterials,
          productionEfficiency: analysisData.productionEfficiency,
          inventorySummary: analysisData.inventorySummary,
          aiAnalysis: aiAnalysis,
          status: "completed",
          triggeredBy: request.auth.uid,
          triggerType: "manual",
        };

        await db.doc("reports/weeklyConsumptionAnalysis").set(reportData);

        await db.collection("reports/weeklyConsumptionAnalysis/history").add({
          ...reportData,
          archivedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        logger.info("triggerWeeklyConsumptionReport - sukces", {
          tasksAnalyzed: tasks.length,
          issuesFound: analysisData.issues.length,
          deviationsFound: analysisData.consumptionDeviations.length,
        });

        return {
          success: true,
          tasksAnalyzed: tasks.length,
          issuesFound: analysisData.issues.length,
          deviationsFound: analysisData.consumptionDeviations.length,
          hasAiAnalysis: !!aiAnalysis && !aiAnalysis.error,
        };
      } catch (error) {
        logger.error("triggerWeeklyConsumptionReport - błąd", {
          error: error.message,
        });

        await db.doc("reports/weeklyConsumptionAnalysis").set({
          generatedAt: admin.firestore.FieldValue.serverTimestamp(),
          status: "error",
          error: error.message,
          triggeredBy: request.auth.uid,
          triggerType: "manual",
        });

        throw new HttpsError("internal", error.message);
      }
    },
);

/**
 * Zaawansowana analiza danych konsumpcji
 * @param {Object} data - Dane do analizy
 * @return {Object} - Wyniki analizy
 */
function performAdvancedAnalysis(data) {
  const {
    tasks,
    issueTransactions,
    inventoryItems,
    lowQuantityBatches,
    expiringBatches,
    allActiveBatches,
    monthTransactions,
  } = data;

  const issues = [];
  const anomalies = [];
  const consumptionDeviations = [];

  const statistics = {
    totalTasks: tasks.length,
    tasksWithConsumption: 0,
    tasksCompleted: tasks.filter((t) =>
      t.status?.toLowerCase() === "zakończone" ||
      t.status?.toLowerCase() === "zakonczone" ||
      t.status?.toLowerCase() === "completed",
    ).length,
    totalIssueTransactions: issueTransactions.length,
    totalConsumedValue: 0,
    uniqueMaterialsConsumed: new Set(),
    uniqueBatchesUsed: new Set(),
  };

  const materialConsumptionMap = new Map();
  const productionEfficiency = [];

  tasks.forEach((task) => {
    const hasConsumption =
      task.consumedMaterials && task.consumedMaterials.length > 0;
    if (hasConsumption) {
      statistics.tasksWithConsumption++;
    }

    if (hasConsumption) {
      task.consumedMaterials.forEach((consumed) => {
        statistics.uniqueMaterialsConsumed.add(consumed.materialId);
        if (consumed.batchId) {
          statistics.uniqueBatchesUsed.add(consumed.batchId);
        }

        const qty = parseFloat(consumed.quantity) || 0;
        const price = parseFloat(consumed.unitPrice) || 0;
        const cost = qty * price;
        statistics.totalConsumedValue += cost;

        const materialKey = consumed.materialId;
        if (!materialConsumptionMap.has(materialKey)) {
          materialConsumptionMap.set(materialKey, {
            materialId: materialKey,
            materialName: consumed.materialName || "Nieznany",
            totalQuantity: 0,
            totalCost: 0,
            taskCount: 0,
          });
        }
        const mat = materialConsumptionMap.get(materialKey);
        mat.totalQuantity += qty;
        mat.totalCost += cost;
        mat.taskCount++;
      });
    }

    if (task.materials && task.materials.length > 0) {
      task.materials.forEach((material) => {
        const materialId = material.inventoryItemId || material.id;
        // material.quantity już jest obliczone dla całego zadania (nie mnożymy przez task.quantity)
        const plannedQty = parseFloat(material.quantity) || 0;

        let actualQty = 0;
        if (
          task.actualMaterialUsage &&
          task.actualMaterialUsage[materialId] !== undefined
        ) {
          actualQty = parseFloat(task.actualMaterialUsage[materialId]) || 0;
        } else if (hasConsumption) {
          actualQty = task.consumedMaterials
              .filter((c) => c.materialId === materialId)
              .reduce((sum, c) => sum + (parseFloat(c.quantity) || 0), 0);
        }

        // Rejestruj odchylenia nawet gdy actualQty = 0 (brak konsumpcji = -100%)
        if (plannedQty > 0) {
          // Brak konsumpcji = -100% odchylenie
          const deviation = actualQty > 0 ?
            ((actualQty - plannedQty) / plannedQty) * 100 :
            -100;

          if (Math.abs(deviation) > 10) {
            consumptionDeviations.push({
              moNumber: task.moNumber || `Zadanie #${task.id?.slice(-6) || "?"}`,
              productName: task.productName || task.name || "Nieznany produkt",
              materialName: material.name || material.itemName || "Nieznany materiał",
              materialSKU: material.sku || material.inventoryItemId || null,
              plannedQuantity: plannedQty || 0,
              actualQuantity: actualQty || 0,
              unit: material.unit || "szt",
              deviationPercent: Math.round(deviation * 10) / 10,
              severity: Math.abs(deviation) > 25 ? "high" : "medium",
            });
          }
        }
      });
    }

    // Sprawdzanie statusu case-insensitive
    const isCompleted =
      task.status?.toLowerCase() === "zakończone" ||
      task.status?.toLowerCase() === "zakonczone" ||
      task.status?.toLowerCase() === "completed";

    if (isCompleted) {
      const plannedQty = parseFloat(task.quantity) || 0;
      // Nie używaj plannedQty jako fallback - to dawało fałszywe 100%
      const producedQty =
        parseFloat(task.producedQuantity) ||
        parseFloat(task.actualQuantity) ||
        null;

      // Oblicz wydajność tylko gdy mamy dane o produkcji
      if (plannedQty > 0 && producedQty !== null) {
        const efficiency = (producedQty / plannedQty) * 100;
        productionEfficiency.push({
          moNumber: task.moNumber || `Zadanie #${task.id?.slice(-6) || "?"}`,
          productName: task.productName || task.name || "Nieznany produkt",
          productSKU: task.productSku || task.sku || null,
          plannedQuantity: plannedQty || 0,
          producedQuantity: producedQty || 0,
          unit: task.unit || "szt",
          efficiency: Math.round(efficiency * 10) / 10,
        });
      } else if (plannedQty > 0) {
        // Zadanie ukończone ale brak danych o wyprodukowanej ilości
        productionEfficiency.push({
          moNumber: task.moNumber || `Zadanie #${task.id?.slice(-6) || "?"}`,
          productName: task.productName || task.name || "Nieznany produkt",
          productSKU: task.productSku || task.sku || null,
          plannedQuantity: plannedQty || 0,
          producedQuantity: null,
          unit: task.unit || "szt",
          efficiency: null, // Brak danych
          note: "Brak danych o wyprodukowanej ilości",
        });
      }
    }

    if (
      isCompleted &&
      !hasConsumption &&
      task.materials?.length > 0
    ) {
      issues.push({
        type: "missing_consumption",
        severity: "high",
        moNumber: task.moNumber || `Zadanie #${task.id?.slice(-6) || "?"}`,
        productName: task.productName || task.name || "Nieznany produkt",
        message:
          `Zadanie ${task.moNumber || "?"} (${task.productName || task.name || "?"}) ` +
          `zakończone bez zarejestrowanej konsumpcji`,
      });
    }

    if (task.materialBatches && Object.keys(task.materialBatches).length > 0) {
      const reservedMaterials = Object.keys(task.materialBatches);

      reservedMaterials.forEach((materialId) => {
        const batches = task.materialBatches[materialId] || [];
        const reservedQty = batches.reduce(
            (sum, b) => sum + (parseFloat(b.quantity) || 0),
            0,
        ) || 0;

        // Znajdź ile faktycznie skonsumowano z tego materiału
        const consumedQty = (task.consumedMaterials || [])
            .filter((c) => c.materialId === materialId)
            .reduce((sum, c) => sum + (parseFloat(c.quantity) || 0), 0);

        // Pobierz nazwę materiału
        const materialInfo = task.materials?.find(
            (m) => m.inventoryItemId === materialId || m.id === materialId,
        );
        const materialName = materialInfo?.name ||
          batches[0]?.materialName ||
          materialId;

        // Problem: zarezerwowano ale w ogóle nie skonsumowano
        if (reservedQty > 0 && consumedQty === 0) {
          issues.push({
            type: "unused_reservation",
            severity: "medium",
            moNumber: task.moNumber || `Zadanie #${task.id?.slice(-6) || "?"}`,
            materialName: materialName,
            reservedQuantity: reservedQty,
            consumedQuantity: 0,
            message:
              `Materiał "${materialName}" zarezerwowany (${reservedQty}) ` +
              `ale w ogóle niezużyty w ${task.moNumber || "?"}`,
          });
        } else if (reservedQty > 0 && consumedQty > 0 && consumedQty < reservedQty * 0.8) {
          // Problem: skonsumowano mniej niż zarezerwowano (>20% różnicy)
          const unusedPercent = Math.round(
              ((reservedQty - consumedQty) / reservedQty) * 100,
          );
          issues.push({
            type: "partial_reservation_unused",
            severity: "low",
            moNumber: task.moNumber || `Zadanie #${task.id?.slice(-6) || "?"}`,
            materialName: materialName,
            reservedQuantity: reservedQty,
            consumedQuantity: consumedQty,
            unusedQuantity: Math.round((reservedQty - consumedQty) * 1000) / 1000,
            unusedPercent: unusedPercent,
            message:
              `Materiał "${materialName}": zarezerwowano ${reservedQty}, ` +
              `skonsumowano ${consumedQty} (${unusedPercent}% niewykorzystane)`,
          });
        }
      });
    }
  });

  const batchesWithReservations = new Set();
  tasks.forEach((task) => {
    if (task.materialBatches) {
      Object.values(task.materialBatches).forEach((batches) => {
        batches.forEach((b) => {
          if (b.batchId) batchesWithReservations.add(b.batchId);
        });
      });
    }
  });

  const recentlyUsedBatches = new Set(
      issueTransactions.map((t) => t.batchId).filter(Boolean),
  );

  const frozenBatches = allActiveBatches
      .filter((batch) => {
        const hasReservation = batchesWithReservations.has(batch.id);
        const wasUsedRecently = recentlyUsedBatches.has(batch.id);
        return hasReservation && !wasUsedRecently && batch.quantity > 0;
      })
      .slice(0, 20)
      .map((batch) => ({
        batchNumber: batch.batchNumber || batch.lotNumber || `LOT-${batch.id?.slice(-6) || "?"}`,
        materialName: batch.materialName || batch.itemName || "Nieznany",
        materialSKU: batch.itemId || batch.sku || null,
        quantity: batch.quantity || 0,
        unit: batch.unit || "szt",
        warehouseName: batch.warehouseName || null,
      }));

  const batchesWithMonthlyActivity = new Set(
      monthTransactions.map((t) => t.batchId).filter(Boolean),
  );

  const dormantBatches = allActiveBatches
      .filter(
          (batch) =>
            !batchesWithMonthlyActivity.has(batch.id) && batch.quantity > 5,
      )
      .slice(0, 30)
      .map((batch) => ({
        batchNumber: batch.batchNumber || batch.lotNumber || `LOT-${batch.id?.slice(-6) || "?"}`,
        materialName: batch.materialName || batch.itemName || "Nieznany",
        materialSKU: batch.itemId || batch.sku || null,
        quantity: batch.quantity || 0,
        unit: batch.unit || "szt",
        warehouseName: batch.warehouseName || null,
        expiryDate: batch.expiryDate?.toDate?.()?.toISOString() || null,
        daysInactive: 30, // Nieaktywne przez ostatni miesiąc
      }));

  const topConsumedMaterials = Array.from(materialConsumptionMap.values())
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 15)
      .map((m) => ({
        ...m,
        totalQuantity: Math.round(m.totalQuantity * 1000) / 1000,
        totalCost: Math.round(m.totalCost * 100) / 100,
      }));

  const inventorySummary = {
    totalItems: inventoryItems.length,
    totalValue: inventoryItems.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0;
      const price =
        parseFloat(item.unitPrice) || parseFloat(item.price) || 0;
      return sum + qty * price;
    }, 0),
    lowStockItems: inventoryItems.filter((item) => {
      const qty = parseFloat(item.quantity) || 0;
      const minQty = parseFloat(item.minQuantity) || 0;
      return minQty > 0 && qty <= minQty;
    }).length,
    expiringBatchesCount: expiringBatches.length,
    lowQuantityBatchesCount: lowQuantityBatches.length,
  };

  inventorySummary.totalValue =
    Math.round(inventorySummary.totalValue * 100) / 100;

  const unusedBatches = lowQuantityBatches.slice(0, 30).map((batch) => ({
    batchNumber: batch.batchNumber || batch.lotNumber || `LOT-${batch.id?.slice(-6) || "?"}`,
    materialName: batch.materialName || batch.itemName || "Nieznany",
    materialSKU: batch.itemId || batch.sku || null,
    quantity: batch.quantity || 0,
    unit: batch.unit ? String(batch.unit) : "szt",
    warehouseName: batch.warehouseName || null,
    expiryDate: batch.expiryDate?.toDate?.()?.toISOString() || null,
    daysUntilExpiry: batch.expiryDate?.toDate ?
      Math.floor(
          (batch.expiryDate.toDate() - new Date()) / (1000 * 60 * 60 * 24),
      ) :
      null,
  }));

  const transactionsByBatch = {};
  issueTransactions.forEach((t) => {
    if (t.batchId) {
      if (!transactionsByBatch[t.batchId]) {
        transactionsByBatch[t.batchId] = [];
      }
      transactionsByBatch[t.batchId].push(t);
    }
  });

  Object.entries(transactionsByBatch).forEach(([batchId, batchTxns]) => {
    if (batchTxns.length > 5) {
      const avgQuantity =
        batchTxns.reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0) /
        batchTxns.length;
      if (avgQuantity < 1) {
        // Pobierz numer partii z pierwszej transakcji
        const batchNumber = batchTxns[0]?.batchNumber ||
          batchTxns[0]?.lotNumber ||
          `LOT-${batchId?.slice(-6) || "?"}`;
        const materialName = batchTxns[0]?.itemName ||
          batchTxns[0]?.materialName ||
          "Nieznany materiał";
        anomalies.push({
          type: "fragmented_consumption",
          batchNumber: batchNumber,
          materialName: materialName,
          transactionCount: batchTxns.length,
          avgQuantity: avgQuantity.toFixed(3),
          message: `Partia ${batchNumber} (${materialName}) ma ${batchTxns.length} małych konsumpcji`,
        });
      }
    }
  });

  statistics.uniqueMaterialsConsumed = statistics.uniqueMaterialsConsumed.size;
  statistics.uniqueBatchesUsed = statistics.uniqueBatchesUsed.size;
  statistics.totalConsumedValue =
    Math.round(statistics.totalConsumedValue * 100) / 100;

  // Oblicz średnią wydajność tylko z zadań które mają dane
  const tasksWithEfficiency = productionEfficiency.filter(
      (p) => p.efficiency !== null,
  );
  // Brak danych = null, nie 100%
  const avgEfficiency = tasksWithEfficiency.length > 0 ?
    tasksWithEfficiency.reduce((sum, p) => sum + p.efficiency, 0) /
        tasksWithEfficiency.length :
    null;

  return {
    statistics,
    issues,
    consumptionDeviations,
    lowQuantityBatches: unusedBatches, // Zmiana nazwy na bardziej precyzyjną
    frozenBatches,
    dormantBatches,
    anomalies,
    topConsumedMaterials,
    productionEfficiency: {
      average: avgEfficiency !== null ?
        Math.round(avgEfficiency * 10) / 10 :
        null,
      tasksAnalyzed: productionEfficiency.length,
      tasksWithData: tasksWithEfficiency.length,
      tasksWithoutData: productionEfficiency.length - tasksWithEfficiency.length,
      lowEfficiencyTasks: tasksWithEfficiency
          .filter((p) => p.efficiency < 95)
          .slice(0, 10),
      tasksWithMissingData: productionEfficiency
          .filter((p) => p.efficiency === null)
          .slice(0, 10),
    },
    inventorySummary,
  };
}

/**
 * Generowanie analizy AI z Gemini
 * @param {string} apiKey - Klucz API Gemini
 * @param {Object} analysisData - Dane do analizy
 * @return {Object} - Wynik analizy AI
 */
async function generateAIAnalysis(apiKey, analysisData) {
  const prompt = `Jesteś ekspertem od zarządzania produkcją i magazynem w systemie MRP.
Przeanalizuj poniższe dane z ostatniego tygodnia i wygeneruj SZCZEGÓŁOWY raport z rekomendacjami.

WAŻNE KONTEKSTY:
- material.quantity w zadaniu to ilość materiału potrzebna na CAŁE zadanie (nie mnożyć przez task.quantity)
- Konsumpcja (consumedMaterials) to rzeczywiste zużycie - porównaj z plannedQuantity
- Status "zakończone" oznacza ukończone zadanie
- Partie z małą ilością mogą być resztkami do wykorzystania lub wskazywać na problem

DANE DO ANALIZY:
${JSON.stringify(analysisData, null, 2)}

WYGENERUJ RAPORT W FORMACIE:

## 📊 Podsumowanie tygodnia
[Szczegółowe podsumowanie aktywności - ile zadań, ile konsumpcji, wartość. Bądź precyzyjny w liczbach.]

## 📈 Wydajność produkcji
[Analiza wydajności - tasksAnalyzed pokazuje ile zadań ukończono. Jeśli 0, wyjaśnij że może to oznaczać brak ukończonych zadań W TYM TYGODNIU, nie problem systemowy.]

## ⚠️ Wykryte problemy
[Lista RZECZYWISTYCH problemów - odróżnij prawdziwe błędy od normalnej pracy systemu]

## 📉 Odchylenia od planu
[Analiza odchyleń - porównanie plannedQuantity vs actualQuantity. Wyjaśnij co oznaczają odchylenia.]

## 💡 Rekomendacje operacyjne
[Konkretne, realistyczne działania do podjęcia]

## 📦 Partie wymagające uwagi
[Lista partii z niską ilością/wygasających - priorytetyzuj użycie. Małe ilości mogą być normalnymi resztkami.]

## 🔮 Sugestie optymalizacyjne
[Propozycje usprawnień oparte na TYCH danych, nie ogólne porady]

WAŻNE FORMATOWANIE:
- Używaj TYLKO składni Markdown (## dla nagłówków, **bold**, *italic*, - dla list)
- NIGDY nie używaj tagów HTML (żadnych <h2>, <p>, <ul>, <li> itp.)
- Nagłówki pisz jako: ## 📊 Tytuł (z emoji)
- Listy jako: - element listy

Pisz po polsku, konkretnie. Skup się na actionable insights.
NIE generuj alarmistycznych wniosków bez podstaw w danych.
Jeśli coś wygląda na problem, ale może być normalnym zachowaniem, zaznacz to.`;

  try {
    // Użycie Gemini 2.5 Pro - ten sam model co w aplikacji MRP
    // Thinking mode jest wbudowany automatycznie w gemini-2.5-pro
    const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/" +
        `gemini-2.5-pro:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            contents: [{role: "user", parts: [{text: prompt}]}],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 65536,
              topP: 0.7,
              topK: 20,
            },
          }),
        },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error("Gemini API error response", {
        status: response.status,
        body: errorBody,
      });
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const responseData = await response.json();

    let textResponse =
      responseData.candidates?.[0]?.content?.parts?.[0]?.text;

    // Post-processing: zamień ewentualne tagi HTML na Markdown
    if (textResponse) {
      textResponse = textResponse
          // Nagłówki
          .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1")
          .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1")
          .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1")
          .replace(/<h4[^>]*>(.*?)<\/h4>/gi, "#### $1")
          // Bold/Italic
          .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**")
          .replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**")
          .replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*")
          .replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*")
          // Listy
          .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1")
          .replace(/<\/?ul[^>]*>/gi, "")
          .replace(/<\/?ol[^>]*>/gi, "")
          // Paragrafy i br
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n")
          // Usuń pozostałe tagi
          .replace(/<\/?[^>]+(>|$)/g, "");
    }

    return {
      content: textResponse || "Nie udało się wygenerować analizy",
      model: "gemini-2.5-pro",
      generatedAt: new Date().toISOString(),
      tokensUsed: responseData.usageMetadata?.totalTokenCount || 0,
    };
  } catch (error) {
    logger.error("Błąd generowania AI", {error: error.message});
    return {
      content: "Błąd podczas generowania analizy AI: " + error.message,
      error: true,
    };
  }
}

module.exports = {triggerWeeklyConsumptionReport};


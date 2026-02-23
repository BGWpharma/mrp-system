const fs = require('fs');
const path = 'src/components/purchaseOrders/PurchaseOrderForm.js';
let c = fs.readFileSync(path, 'utf8');
const eol = c.includes('\r\n') ? '\r\n' : '\n';
let changeCount = 0;

// Fix 1: cancelled check after getPurchaseOrderById in fetchInitialData
const fix1search = 'const poDetails = await getPurchaseOrderById(currentOrderId);' + eol +
  '          console.log("Pobrane dane zam';
const fix1after = 'const poDetails = await getPurchaseOrderById(currentOrderId);' + eol +
  '          if (cancelled) return;' + eol +
  '          console.log("Pobrane dane zam';

if (c.includes(fix1search)) {
  const checkAlready = 'getPurchaseOrderById(currentOrderId);' + eol + '          if (cancelled) return;';
  if (!c.includes(checkAlready)) {
    c = c.replace(fix1search, fix1after);
    changeCount++;
    console.log('Fix 1 applied');
  } else {
    console.log('Fix 1 already present');
  }
} else {
  console.log('Fix 1 pattern not found');
}

// Fix 2: catch/finally in fetchInitialData
const catchOld = '      } catch (error) {' + eol +
  '        console.error' ;
const catchCheck = '      } catch (error) {' + eol + '        if (cancelled) return;';

// Only apply to the first occurrence (fetchInitialData)
const firstCatchIdx = c.indexOf(catchOld);
if (firstCatchIdx >= 0 && !c.substring(firstCatchIdx, firstCatchIdx + 200).includes('if (cancelled) return;')) {
  // Find context to make sure this is fetchInitialData's catch
  const contextBefore = c.substring(Math.max(0, firstCatchIdx - 100), firstCatchIdx);
  if (contextBefore.includes('generalAttachments') || contextBefore.includes('fetchInitialData')) {
    const oldCatch = c.substring(firstCatchIdx, c.indexOf(eol, firstCatchIdx));
    const nextLines = c.substring(firstCatchIdx).split(eol);
    
    // Check if this catch block is followed by finally { setLoading(false); }
    let foundFinally = false;
    let finallyIdx = -1;
    for (let i = 0; i < Math.min(nextLines.length, 10); i++) {
      if (nextLines[i].trim() === '} finally {') {
        foundFinally = true;
        finallyIdx = i;
        break;
      }
    }
    
    if (foundFinally) {
      // Insert cancelled check after catch
      nextLines.splice(1, 0, '        if (cancelled) return;');
      
      // Find and wrap setLoading in finally
      for (let i = finallyIdx + 1; i < Math.min(nextLines.length, finallyIdx + 5); i++) {
        if (nextLines[i].trim() === 'setLoading(false);') {
          nextLines[i] = '        if (!cancelled) {' + eol + '          setLoading(false);' + eol + '        }';
          break;
        }
      }
      
      // Rebuild the section
      const oldSection = c.substring(firstCatchIdx).split(eol).slice(0, finallyIdx + 4).join(eol);
      const newSection = nextLines.slice(0, finallyIdx + 5).join(eol);
      c = c.replace(oldSection, newSection);
      changeCount++;
      console.log('Fix 2 applied');
    }
  }
}

fs.writeFileSync(path, c, 'utf8');
console.log('Applied ' + changeCount + ' fixes. Remaining: inline fetchData into useEffect.');

const getAnswerButton = document.getElementById("getAnswerButton");
const answerContainer = document.getElementById("answerContainer");
const statusElement = document.getElementById("status");

document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(["savedAnswersHTML"], (result) => {
    if (result.savedAnswersHTML) {
      answerContainer.innerHTML = result.savedAnswersHTML;
      const status = document.getElementById("status");
      if (status) status.remove();
    }
  });
});

getAnswerButton.addEventListener("click", () => {
  updateStatus("Đang tìm URL bài tập...");

  chrome.storage.local.get(["lastExerciseUrl"], async (result) => {
    if (!result.lastExerciseUrl) {
      updateStatus(
        "Không tìm thấy URL. Vui lòng tải lại trang bài tập (F5) rồi thử lại."
      );
      return;
    }

    updateStatus("Đang tải file XML...");
    console.log("Đang fetch từ URL:", result.lastExerciseUrl);

    try {
      const response = await fetch(result.lastExerciseUrl);
      if (!response.ok) {
        throw new Error(`Lỗi HTTP! Status: ${response.status}`);
      }
      const xmlText = await response.text();

      updateStatus("Đang phân tích đáp án...");

      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "text/xml");

      let finalAnswersHTML = "";
      finalAnswersHTML = findAnswerKeyByText(xmlDoc);

      if (!finalAnswersHTML) {
        console.log(
          "Strategy 1 (text search) failed. Trying Strategy 2 (button event)..."
        );
        finalAnswersHTML = findAnswerKeyByButtonEvent(xmlDoc);
      }

      if (!finalAnswersHTML) {
        console.log(
          "Strategy 2 (button event) failed. Trying Strategy 3 (parse individual)..."
        );
        finalAnswersHTML = parseIndividualAnswers(xmlDoc);
      }
      // ==========================================================

      if (finalAnswersHTML) {
        answerContainer.innerHTML = finalAnswersHTML;

        const status = document.getElementById("status");
        if (status) status.remove();

        chrome.storage.local.set({ savedAnswersHTML: finalAnswersHTML });
      } else {
        updateStatus(
          "Đã tải xong XML nhưng không tìm thấy đáp án (for three ways)"
        );
      }
    } catch (error) {
      console.error("Lỗi khi fetch hoặc parse XML:", error);
      updateStatus("Lỗi nghiêm trọng: " + error.message);
    }
  });
});

function updateStatus(message) {
  let status = document.getElementById("status");
  if (!status) {
    status = document.createElement("p");
    status.id = "status";
    answerContainer.prepend(status);
  }
  status.textContent = message;
  status.style.fontStyle = "italic";
  status.style.color = "#555";
}

function findAnswerKeyByText(xmlDoc) {
  try {
    const allTextModules = xmlDoc.querySelectorAll("textModule text");
    for (const node of allTextModules) {
      const cdata = node.textContent;
      if (cdata && /<[^>]+>Answer Key/i.test(cdata)) {
        console.log("Strategy 1 SUCCESS. Found 'Answer Key' text in module.");
        return cdata;
      }
    }
  } catch (e) {
    console.error("Strategy 1 Error:", e);
  }
  return null;
}

function findAnswerKeyByButtonEvent(xmlDoc) {
  try {
    // Tìm tất cả các nút "Double_State_Button"
    const buttons = xmlDoc.querySelectorAll(
      'addonModule[addonId="Double_State_Button"]'
    );
    for (const button of buttons) {
      // Tìm property "onSelected"
      const onSelectedProp = button.querySelector(
        'property[name="onSelected"]'
      );
      if (onSelectedProp) {
        const eventScript = onSelectedProp.getAttribute("value");

        const match = eventScript.match(/^([a-zA-Z0-9_]+)\.show\(\)$/);

        if (match && match[1]) {
          const moduleId = match[1];
          console.log(
            `Strategy 2: Found button event for module ID: ${moduleId}`
          );

          const answerNode = xmlDoc.querySelector(
            `textModule[id="${moduleId}"] text`
          );
          if (answerNode) {
            console.log("Strategy 2 SUCCESS.");
            return answerNode.textContent;
          }
        }
      }
    }
  } catch (e) {
    console.error("Strategy 2 Error:", e);
  }
  return null;
}

function parseIndividualAnswers(xmlDoc) {
  let htmlOutput =
    '<h3>Không tìm thấy "Answer Key", đây là các đáp án tự động trích xuất:</h3>';
  let found = false;

  try {
    const gapNodes = xmlDoc.querySelectorAll("textModule text");
    gapNodes.forEach((node) => {
      const cdata = node.textContent;
      const gaps = [...cdata.matchAll(/\\gap\{([^}]+)\}/g)];
      if (gaps.length > 0) {
        if (cdata && /<[^>]+>Answer Key/i.test(cdata)) {
          return;
        }

        found = true;
        htmlOutput += "<h4>Dạng Gap-fill:</h4><ul>";
        gaps.forEach((match, index) => {
          const answer = match[1].split("|")[0];
          htmlOutput += `<li><b>Câu ${index + 1}:</b> ${answer}</li>`;
        });
        htmlOutput += "</ul>";
      }
    });
  } catch (e) {
    console.error("Strategy 3 Error (gap-fill):", e);
  }

  try {
    const choiceModules = xmlDoc.querySelectorAll(
      'addonModule[addonId="TrueFalse"], addonModule[addonId="MultipleChoice"]'
    );
    choiceModules.forEach((module) => {
      found = true;
      const questions = module.querySelectorAll(
        'property[displayName="Questions"] item'
      );
      const choices = module.querySelectorAll(
        'property[displayName="Choices"] item property[displayName="Choice"]'
      );

      const choiceArray = [];
      choices.forEach((choice) => {
        choiceArray.push(choice.textContent.trim());
      });

      htmlOutput += `<h4>Dạng Multiple Choice (ID: ${module.getAttribute(
        "id"
      )}):</h4><ul>`;
      questions.forEach((q, index) => {
        const questionText = q
          .querySelector('property[displayName="Question"]')
          .textContent.replace(/<\/?(div|b|i|br)>/g, "")
          .trim();
        const answerIndex = q
          .querySelector('property[displayName="Answer"]')
          .getAttribute("value");
        const answerText =
          choiceArray[parseInt(answerIndex, 10) - 1] || "Không rõ";

        htmlOutput += `<li><b>Câu ${index + 1} (${questionText.substring(
          0,
          20
        )}...):</b> ${answerText}</li>`;
      });
      htmlOutput += "</ul>";
    });
  } catch (e) {
    console.error("Strategy 3 Error (multiple choice):", e);
  }

  return found ? htmlOutput : "";
}

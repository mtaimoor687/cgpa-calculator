const express = require("express");
const puppeteer = require("puppeteer");
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.post("/fetch-result", async (req, res) => {
  const { agNumber } = req.body;

  if (!agNumber) {
    return res.status(400).json({ error: "AG number is required" });
  }

  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto("http://lms.uaf.edu.pk/course/uaf_student_result.php");

    await page.type("input[name='regnum']", agNumber);
    await page.click("button[type='submit']");

    await page.waitForSelector(".table");

    const data = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".table tbody tr"));
      const result = [];
      let semester = "";

      for (const row of rows) {
        const tds = row.querySelectorAll("td");
        if (tds.length === 1 && tds[0].textContent.includes("Semester")) {
          semester = tds[0].textContent.trim();
        } else if (tds.length >= 5) {
          const [code, title, credit, marks, percent] = Array.from(tds).map(td => td.textContent.trim());
          result.push({ semester, code, title, credit: parseFloat(credit), percent: parseFloat(percent) });
        }
      }
      return result;
    });

    await browser.close();

    // Compute semester GPA and CGPA
    const semesterMap = {};
    data.forEach(item => {
      const gp = getQualityPoints(item.percent);
      const qp = gp * item.credit;
      if (!semesterMap[item.semester]) {
        semesterMap[item.semester] = { qp: 0, credit: 0, subjects: [] };
      }
      semesterMap[item.semester].qp += qp;
      semesterMap[item.semester].credit += item.credit;
      semesterMap[item.semester].subjects.push({ ...item, gp: gp.toFixed(2), qp: qp.toFixed(2) });
    });

    const semesters = [];
    let totalQP = 0, totalCredits = 0;

    for (const sem in semesterMap) {
      const { qp, credit, subjects } = semesterMap[sem];
      totalQP += qp;
      totalCredits += credit;
      semesters.push({
        semester: sem,
        gpa: (qp / credit).toFixed(2),
        subjects
      });
    }

    const cgpa = (totalQP / totalCredits).toFixed(2);

    res.json({ semesters, cgpa });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch or process result." });
  }
});

function getQualityPoints(percent) {
  const p = parseFloat(percent);
  if (p >= 80) return 4.00;
  if (p >= 75) return 3.67;
  if (p >= 70) return 3.33;
  if (p >= 65) return 3.00;
  if (p >= 61) return 2.67;
  if (p >= 58) return 2.33;
  if (p >= 55) return 2.00;
  if (p >= 50) return 1.67;
  if (p >= 40) return 1.00;
  return 0.00;
}

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
